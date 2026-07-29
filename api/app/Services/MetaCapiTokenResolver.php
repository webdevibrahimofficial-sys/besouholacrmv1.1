<?php

namespace App\Services;

use App\Models\Integration;

class MetaCapiTokenResolver
{
    public function __construct(
        protected MetaSystemSettingsService $metaSystemSettings,
        protected IntegrationSecretsService $secrets
    ) {
    }

    /**
     * Resolve the access token for Conversions API calls.
     *
     * Prefers a pixel-level token from Events Manager (stored in tenant settings).
     * Falls back to the shared app access token (app_id|app_secret) when no pixel token is configured.
     *
     * @return array{token: string, source: 'pixel'|'app'}
     */
    public function resolveForTenant(int|string $tenantId): array
    {
        $integration = Integration::where('tenant_id', $tenantId)
            ->where('provider', 'meta')
            ->first();
        $settings = is_array($integration?->settings) ? $integration->settings : [];
        $pixelToken = $this->secrets->decryptSecret($settings['pixel_access_token'] ?? null);

        if (is_string($pixelToken) && trim($pixelToken) !== '') {
            return [
                'token' => trim($pixelToken),
                'source' => 'pixel',
            ];
        }

        $credentials = $this->metaSystemSettings->resolveSharedCredentials();

        return [
            'token' => $credentials['app_id'] . '|' . $credentials['app_secret'],
            'source' => 'app',
        ];
    }
}
