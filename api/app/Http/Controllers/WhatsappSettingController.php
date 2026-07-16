<?php

namespace App\Http\Controllers;

use App\Models\WhatsappChannel;
use App\Models\WhatsappSetting;
use App\Services\Whatsapp\WhatsappChannelService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class WhatsappSettingController extends Controller
{
    public function __construct(
        private readonly WhatsappChannelService $channelService,
    ) {
    }

    public function show()
    {
        $user = Auth::user();
        if (!$user->tenant_id) {
            return response()->json(['message' => 'User does not belong to a tenant'], 403);
        }
        if ($resp = $this->ensureWhatsappAdmin($user)) {
            return $resp;
        }

        $settings = WhatsappSetting::firstOrCreate(
            ['tenant_id' => $user->tenant_id],
            [
                'provider' => 'meta', // Default
                'status' => false
            ]
        );

        return response()->json($this->serializeSettings($settings));
    }

    public function update(Request $request)
    {
        $user = Auth::user();
        if (!$user->tenant_id) {
            return response()->json(['message' => 'User does not belong to a tenant'], 403);
        }
        if ($resp = $this->ensureWhatsappAdmin($user)) {
            return $resp;
        }

        $settings = WhatsappSetting::firstOrCreate(['tenant_id' => $user->tenant_id]);

        $validated = $request->validate([
            'provider' => 'required|string',
            'api_key' => 'nullable|string',
            'api_secret' => 'nullable|string',
            'business_number' => 'nullable|string',
            'business_id' => 'nullable|string',
            'phone_number_id' => 'nullable|string',
            'business_account_id' => 'nullable|string',
            'webhook_url' => 'nullable|url',
            'status' => 'boolean',
            'triggers' => 'nullable|array',
            'auto_create_ctwa_leads' => 'boolean',
        ]);

        if (empty($validated['phone_number_id']) && !empty($validated['api_secret'])) {
            $validated['phone_number_id'] = $validated['api_secret'];
        }

        foreach (['api_key', 'api_secret'] as $secretField) {
            if (!array_key_exists($secretField, $validated)) {
                continue;
            }

            $value = trim((string) ($validated[$secretField] ?? ''));
            if ($value === '') {
                unset($validated[$secretField]);
            }
        }

        $settings->update($validated);

        $this->channelService->upsertFromSettings((int) $user->tenant_id, array_merge($validated, [
            'provider' => $validated['provider'] ?? 'meta',
            'exclude_channel_id' => WhatsappChannel::query()
                ->where('tenant_id', $user->tenant_id)
                ->where('provider', WhatsappChannel::PROVIDER_META_CLOUD)
                ->value('id') ?? 0,
        ]));

        return response()->json($this->serializeSettings($settings->fresh()));
    }

    private function serializeSettings(WhatsappSetting $settings): array
    {
        $data = $settings->toArray();

        $apiKey = (string) ($settings->api_key ?? '');
        $apiSecret = (string) ($settings->api_secret ?? '');

        $data['api_key'] = null;
        $data['api_secret'] = null;
        $data['has_api_key'] = $apiKey !== '';
        $data['has_api_secret'] = $apiSecret !== '';
        $data['api_key_masked'] = $this->maskSecret($apiKey);
        $data['api_secret_masked'] = $this->maskSecret($apiSecret);

        return $data;
    }

    private function maskSecret(string $value): ?string
    {
        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        $suffix = substr($trimmed, -4);
        return str_repeat('*', max(strlen($trimmed) - 4, 8)) . $suffix;
    }

    private function ensureWhatsappAdmin($user)
    {
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $roleLower = strtolower(trim((string) ($user->role ?? $user->job_title ?? '')));
        $isTenantAdmin = $user->is_super_admin || in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'owner'], true);

        if ($isTenantAdmin) {
            return null;
        }

        return response()->json(['message' => 'Only tenant admins can manage WhatsApp settings.'], 403);
    }
}
