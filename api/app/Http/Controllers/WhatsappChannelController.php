<?php

namespace App\Http\Controllers;

use App\Models\WhatsappChannel;
use App\Services\Whatsapp\MetaCloudApiProvider;
use App\Services\Whatsapp\WhatsappChannelService;
use App\Support\PhoneNormalizer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class WhatsappChannelController extends Controller
{
    public function __construct(
        private readonly WhatsappChannelService $channelService,
    ) {
    }

    public function index(Request $request)
    {
        $user = $request->user();
        if ($resp = $this->ensureWhatsappAdmin($user)) {
            return $resp;
        }

        $channels = $this->channelService->listForTenant((int) $user->tenant_id);

        return response()->json([
            'channels' => $channels->map(fn (WhatsappChannel $channel) => $this->serializeChannel($channel)),
        ]);
    }

    public function setPrimary(Request $request, WhatsappChannel $channel)
    {
        $user = $request->user();
        if ($resp = $this->ensureWhatsappAdmin($user)) {
            return $resp;
        }

        if ((int) $channel->tenant_id !== (int) $user->tenant_id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $updated = $this->channelService->setPrimary((int) $user->tenant_id, (int) $channel->id);

        return response()->json($this->serializeChannel($updated));
    }

    public function startMigration(Request $request, WhatsappChannel $mirrorChannel)
    {
        $user = $request->user();
        if ($resp = $this->ensureWhatsappAdmin($user)) {
            return $resp;
        }

        $validated = $request->validate([
            'cloud_channel_id' => 'required|integer|exists:whatsapp_channels,id',
        ]);

        if ((int) $mirrorChannel->tenant_id !== (int) $user->tenant_id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $result = $this->channelService->startMigration(
            (int) $user->tenant_id,
            (int) $mirrorChannel->id,
            (int) $validated['cloud_channel_id']
        );

        return response()->json([
            'mirror' => $this->serializeChannel($result['mirror']),
            'cloud' => $this->serializeChannel($result['cloud']),
        ]);
    }

    public function completeMigration(Request $request, WhatsappChannel $mirrorChannel)
    {
        $user = $request->user();
        if ($resp = $this->ensureWhatsappAdmin($user)) {
            return $resp;
        }

        $validated = $request->validate([
            'cloud_channel_id' => 'required|integer|exists:whatsapp_channels,id',
        ]);

        if ((int) $mirrorChannel->tenant_id !== (int) $user->tenant_id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $result = $this->channelService->completeMigration(
            (int) $user->tenant_id,
            (int) $mirrorChannel->id,
            (int) $validated['cloud_channel_id']
        );

        return response()->json([
            'mirror' => $this->serializeChannel($result['mirror']),
            'cloud' => $this->serializeChannel($result['cloud']),
        ]);
    }

    public function sendMigrationVerification(
        Request $request,
        WhatsappChannel $channel,
        MetaCloudApiProvider $metaCloudApiProvider
    ) {
        $user = $request->user();
        if ($resp = $this->ensureWhatsappAdmin($user)) {
            return $resp;
        }

        if ((int) $channel->tenant_id !== (int) $user->tenant_id) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        if ($channel->provider !== WhatsappChannel::PROVIDER_META_CLOUD) {
            return response()->json(['message' => 'Verification messages can only be sent from a Meta Cloud channel.'], 422);
        }

        $validated = $request->validate([
            'to' => 'required|string|min:8|max:32',
        ]);

        $to = PhoneNormalizer::digits($validated['to']);
        if (strlen($to) < 8) {
            return response()->json(['message' => 'Enter a valid phone number including country code.'], 422);
        }

        $body = 'BeSouhola CRM: Reply to this message to verify Cloud WhatsApp inbound for migration.';

        $result = $metaCloudApiProvider->sendText(
            (int) $user->tenant_id,
            $to,
            $body,
            (int) $channel->id
        );

        if (! ($result['ok'] ?? false)) {
            $metaError = data_get($result, 'response.error.message')
                ?: data_get($result, 'response.error.error_user_msg')
                ?: 'Failed to send verification message.';

            return response()->json([
                'ok' => false,
                'message' => $metaError,
                'hint' => 'If Meta blocks outbound (24h window), send any WhatsApp message TO your Cloud business number from this phone instead. Inbound will verify automatically.',
                'response' => $result['response'] ?? null,
            ], 422);
        }

        $this->channelService->markMigrationVerificationSent($channel->fresh(), $to);

        return response()->json([
            'ok' => true,
            'message' => 'Verification message sent. Reply to it (or send any message to the Cloud number) to confirm inbound.',
            'channel' => $this->serializeChannel($channel->fresh()),
            'to' => $to,
        ]);
    }

    private function serializeChannel(WhatsappChannel $channel): array
    {
        return [
            'id' => $channel->id,
            'tenant_id' => $channel->tenant_id,
            'provider' => $channel->provider,
            'display_name' => $channel->display_name,
            'phone_number' => $channel->phone_number,
            'phone_number_id' => $channel->phone_number_id,
            'business_account_id' => $channel->business_account_id,
            'status' => $channel->status,
            'is_primary' => (bool) $channel->is_primary,
            'supports_inbound' => (bool) $channel->supports_inbound,
            'supports_outbound' => (bool) $channel->supports_outbound,
            'supports_ctwa_attribution' => (bool) $channel->supports_ctwa_attribution,
            'last_connected_at' => $channel->last_connected_at?->toISOString(),
            'last_error' => $channel->last_error,
            'metadata' => $channel->metadata ?? [],
            'has_access_token' => trim((string) ($channel->access_token ?? '')) !== '',
        ];
    }

    private function ensureWhatsappAdmin($user)
    {
        if (! $user) {
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
