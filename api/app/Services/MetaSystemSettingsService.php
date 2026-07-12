<?php

namespace App\Services;

use App\Models\SystemSetting;
use Illuminate\Support\Str;
use RuntimeException;

class MetaSystemSettingsService
{
    public const KEY_APP_ID = 'meta_app_id';
    public const KEY_APP_SECRET = 'meta_app_secret';
    public const KEY_VERIFY_TOKEN = 'meta_verify_token';

    public function __construct(protected IntegrationSecretsService $secrets)
    {
    }

    public function isConfigured(): bool
    {
        $credentials = $this->resolveSharedCredentials(false);

        return !empty($credentials['app_id']) && !empty($credentials['app_secret']);
    }

    public function resolveSharedCredentials(bool $requireConfigured = true): array
    {
        $appId = $this->getSettingValue(self::KEY_APP_ID)
            ?? config('services.facebook.client_id');
        $appSecret = $this->secrets->decryptSecret(
            $this->getSettingValue(self::KEY_APP_SECRET) ?? config('services.facebook.client_secret')
        );
        $verifyToken = $this->getSettingValue(self::KEY_VERIFY_TOKEN)
            ?? config('services.facebook.verify_token');

        if ($requireConfigured && (empty($appId) || empty($appSecret))) {
            throw new RuntimeException('Shared Meta App is not configured. Please configure it in System Admin settings.');
        }

        return [
            'source' => 'shared',
            'app_id' => is_string($appId) ? trim($appId) : $appId,
            'app_secret' => is_string($appSecret) ? trim((string) $appSecret) : $appSecret,
            'verify_token' => is_string($verifyToken) ? trim((string) $verifyToken) : $verifyToken,
        ];
    }

    public function getPublicSettings(): array
    {
        $credentials = $this->resolveSharedCredentials(false);
        $webhookBase = rtrim((string) config('app.url'), '/');

        return [
            'meta_app_id' => $credentials['app_id'] ?? '',
            'meta_app_secret_masked' => $this->secrets->maskSecret($credentials['app_secret'] ?? null),
            'meta_verify_token' => $credentials['verify_token'] ?? '',
            'meta_webhook_url' => $webhookBase . '/api/meta/webhook',
            'meta_configured' => $this->isConfigured(),
        ];
    }

    public function persistSettings(array $settings): void
    {
        if (array_key_exists(self::KEY_APP_ID, $settings)) {
            $this->upsert(self::KEY_APP_ID, (string) ($settings[self::KEY_APP_ID] ?? ''));
        }

        if (array_key_exists(self::KEY_APP_SECRET, $settings)) {
            $secret = trim((string) ($settings[self::KEY_APP_SECRET] ?? ''));
            if ($this->secrets->shouldPersistSecret($secret)) {
                $this->upsert(self::KEY_APP_SECRET, $this->secrets->encryptSecret($secret));
            }
        }

        if (array_key_exists(self::KEY_VERIFY_TOKEN, $settings)) {
            $verifyToken = trim((string) ($settings[self::KEY_VERIFY_TOKEN] ?? ''));
            if ($verifyToken === '') {
                $verifyToken = Str::random(40);
            }
            $this->upsert(self::KEY_VERIFY_TOKEN, $verifyToken);
        }
    }

    public function encryptSecret(string $value): string
    {
        return $this->secrets->encryptSecret($value);
    }

    public function decryptSecret(?string $value): ?string
    {
        return $this->secrets->decryptSecret($value);
    }

    public function maskSecret(?string $value): ?string
    {
        return $this->secrets->maskSecret($value);
    }

    protected function getSettingValue(string $key): ?string
    {
        $value = SystemSetting::where('key', $key)->value('value');

        return is_string($value) ? $value : null;
    }

    protected function upsert(string $key, string $value): void
    {
        SystemSetting::updateOrCreate(
            ['key' => $key],
            ['value' => $value]
        );
    }
}
