<?php

namespace App\Services;

use App\Models\TenantMetaApp;
use RuntimeException;

class MetaCredentialsResolver
{
    public function __construct(
        protected MetaSystemSettingsService $metaSystemSettings,
        protected TenantMetaAppService $tenantMetaApps
    ) {
    }

    public function resolveForTenant($tenantId = null): array
    {
        if ($tenantId !== null && $tenantId !== '') {
            $app = $this->tenantMetaApps->findForTenant($tenantId);

            if ($app && $app->isCustomMode()) {
                if (!$app->hasCompleteCustomCredentials()) {
                    throw new RuntimeException('Tenant Meta App is not fully configured. Please save App ID and App Secret.');
                }

                return [
                    'source' => 'custom',
                    'app_id' => trim((string) $app->app_id),
                    'app_secret' => trim((string) $app->app_secret),
                    'verify_token' => is_string($app->verify_token) ? trim($app->verify_token) : $app->verify_token,
                    'webhook_key' => $app->webhook_key,
                    'tenant_id' => $tenantId,
                ];
            }
        }

        if (!config('services.meta.mock_mode') && !$this->metaSystemSettings->isConfigured()) {
            throw new RuntimeException('Shared Meta App is not configured. Please configure it in System Admin settings, or connect using your own Meta App.');
        }

        $credentials = $this->metaSystemSettings->resolveSharedCredentials(!config('services.meta.mock_mode'));

        return array_merge($credentials, [
            'source' => 'shared',
            'tenant_id' => $tenantId,
        ]);
    }

    public function resolveShared(): array
    {
        return $this->metaSystemSettings->resolveSharedCredentials(!config('services.meta.mock_mode'));
    }

    public function resolveByWebhookKey(string $webhookKey): array
    {
        $app = $this->tenantMetaApps->findByWebhookKey($webhookKey);

        if (!$app || !$app->hasCompleteCustomCredentials()) {
            throw new RuntimeException('Tenant Meta webhook key is invalid or incomplete.');
        }

        return [
            'source' => 'custom',
            'app_id' => trim((string) $app->app_id),
            'app_secret' => trim((string) $app->app_secret),
            'verify_token' => is_string($app->verify_token) ? trim($app->verify_token) : $app->verify_token,
            'webhook_key' => $app->webhook_key,
            'tenant_id' => $app->tenant_id,
        ];
    }

    public function isMetaReady($tenantId = null): bool
    {
        if ($tenantId !== null && $tenantId !== '' && $this->tenantMetaApps->isCustomReady($tenantId)) {
            return true;
        }

        return $this->metaSystemSettings->isConfigured() || (bool) config('services.meta.mock_mode');
    }

    public function connectionMode($tenantId = null): string
    {
        if ($tenantId === null || $tenantId === '') {
            return TenantMetaApp::MODE_SHARED;
        }

        return $this->tenantMetaApps->connectionMode($tenantId);
    }
}
