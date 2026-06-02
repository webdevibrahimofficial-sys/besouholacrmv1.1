<?php

namespace App\Services;

use App\Models\TenantMetaApp;
use Illuminate\Support\Str;
use RuntimeException;

class TenantMetaCredentialsResolver
{
    public function resolveForTenant($tenantId): array
    {
        if (!$tenantId) {
            throw new RuntimeException('Tenant id is required for Meta credentials.');
        }

        $tenantApp = TenantMetaApp::where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->first();

        if (!$tenantApp) {
            throw new RuntimeException('Tenant Meta App is not configured or inactive.');
        }

        return [
            'source' => 'tenant',
            'tenant_id' => $tenantId,
            'app_id' => $tenantApp->app_id,
            'app_secret' => $tenantApp->app_secret,
            'verify_token' => $tenantApp->verify_token,
            'webhook_key' => $tenantApp->webhook_key,
        ];
    }

    public function resolveByWebhookKey(string $webhookKey): ?array
    {
        $tenantApp = TenantMetaApp::where('webhook_key', $webhookKey)
            ->where('is_active', true)
            ->first();

        if (!$tenantApp) {
            return null;
        }

        return [
            'source' => 'tenant',
            'tenant_id' => $tenantApp->tenant_id,
            'app_id' => $tenantApp->app_id,
            'app_secret' => $tenantApp->app_secret,
            'verify_token' => $tenantApp->verify_token,
            'webhook_key' => $tenantApp->webhook_key,
        ];
    }

    public function generateWebhookKey(): string
    {
        do {
            $candidate = Str::lower(Str::random(40));
        } while (TenantMetaApp::where('webhook_key', $candidate)->exists());

        return $candidate;
    }
}
