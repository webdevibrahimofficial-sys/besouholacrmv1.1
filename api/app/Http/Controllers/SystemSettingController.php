<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use App\Services\IntegrationSecretsService;
use App\Services\MetaSystemSettingsService;
use Illuminate\Http\Request;

class SystemSettingController extends Controller
{
    public const KEY_GOOGLE_CLIENT_SECRET = 'google_client_secret';

    public function __construct(
        protected MetaSystemSettingsService $metaSystemSettings,
        protected IntegrationSecretsService $secrets
    ) {
    }

    protected function authorizeSuperAdmin(Request $request): void
    {
        $user = $request->user();

        abort_unless($user && ($user->is_super_admin ?? false), 403, 'Super Admin access required.');
    }

    public function index(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $settings = SystemSetting::all()->pluck('value', 'key')->toArray();

        if (array_key_exists(MetaSystemSettingsService::KEY_APP_SECRET, $settings)) {
            $settings[MetaSystemSettingsService::KEY_APP_SECRET] = $this->metaSystemSettings
                ->maskSecret(
                    $this->metaSystemSettings->decryptSecret($settings[MetaSystemSettingsService::KEY_APP_SECRET] ?? null)
                ) ?? '';
        }

        if (array_key_exists(self::KEY_GOOGLE_CLIENT_SECRET, $settings)) {
            $settings[self::KEY_GOOGLE_CLIENT_SECRET] = $this->secrets->maskSecret(
                $this->secrets->decryptSecret($settings[self::KEY_GOOGLE_CLIENT_SECRET] ?? null)
            ) ?? '';
        }

        $metaPublic = $this->metaSystemSettings->getPublicSettings();
        $settings['meta_webhook_url'] = $metaPublic['meta_webhook_url'];
        $settings['meta_configured'] = $metaPublic['meta_configured'];

        return response()->json($settings);
    }

    public function update(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $validated = $request->validate([
            'settings' => 'required|array',
            'settings.*' => 'nullable|string',
        ]);

        $settings = $validated['settings'];
        $metaKeys = [
            MetaSystemSettingsService::KEY_APP_ID,
            MetaSystemSettingsService::KEY_APP_SECRET,
            MetaSystemSettingsService::KEY_VERIFY_TOKEN,
        ];

        if (array_intersect(array_keys($settings), $metaKeys)) {
            $this->metaSystemSettings->persistSettings($settings);
            unset(
                $settings[MetaSystemSettingsService::KEY_APP_ID],
                $settings[MetaSystemSettingsService::KEY_APP_SECRET],
                $settings[MetaSystemSettingsService::KEY_VERIFY_TOKEN]
            );
        }

        foreach ($settings as $key => $value) {
            if ($key === self::KEY_GOOGLE_CLIENT_SECRET && !$this->secrets->shouldPersistSecret($value)) {
                continue;
            }

            if ($key === self::KEY_GOOGLE_CLIENT_SECRET && $this->secrets->shouldPersistSecret($value)) {
                $value = $this->secrets->encryptSecret(trim((string) $value));
            }

            SystemSetting::updateOrCreate(
                ['key' => $key],
                ['value' => $value]
            );
        }

        return response()->json(['message' => 'Settings updated successfully']);
    }
}
