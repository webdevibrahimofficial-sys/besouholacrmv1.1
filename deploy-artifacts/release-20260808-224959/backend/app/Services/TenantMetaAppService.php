<?php

namespace App\Services;

use App\Models\MetaConnection;
use App\Models\TenantMetaApp;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class TenantMetaAppService
{
    public function __construct(protected IntegrationSecretsService $secrets)
    {
    }

    public function findForTenant(int|string $tenantId): ?TenantMetaApp
    {
        return TenantMetaApp::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->first();
    }

    public function findByWebhookKey(string $webhookKey): ?TenantMetaApp
    {
        $key = trim($webhookKey);
        if ($key === '') {
            return null;
        }

        return TenantMetaApp::withoutGlobalScopes()
            ->where('webhook_key', $key)
            ->where('mode', TenantMetaApp::MODE_CUSTOM)
            ->where('is_active', true)
            ->first();
    }

    public function connectionMode(int|string $tenantId): string
    {
        $app = $this->findForTenant($tenantId);

        if ($app && $app->isCustomMode() && $app->hasCompleteCustomCredentials()) {
            return TenantMetaApp::MODE_CUSTOM;
        }

        return TenantMetaApp::MODE_SHARED;
    }

    public function isCustomReady(int|string $tenantId): bool
    {
        $app = $this->findForTenant($tenantId);

        return $app
            && $app->isCustomMode()
            && $app->hasCompleteCustomCredentials();
    }

    public function toPublicArray(?TenantMetaApp $app): ?array
    {
        if (!$app) {
            return null;
        }

        $webhookBase = rtrim((string) config('app.url'), '/');

        return [
            'mode' => $app->mode,
            'app_id' => $app->app_id,
            'app_secret_masked' => $this->secrets->maskSecret($app->app_secret),
            'has_app_secret' => filled($app->app_secret),
            'verify_token' => $app->verify_token,
            'webhook_key' => $app->webhook_key,
            'webhook_url' => $webhookBase . '/api/meta/webhook/' . $app->webhook_key,
            'oauth_callback_url' => $webhookBase . '/api/auth/meta/callback',
            'is_active' => (bool) $app->is_active,
            'is_custom_ready' => $app->isCustomMode() && $app->hasCompleteCustomCredentials(),
        ];
    }

    /**
     * @param  array{mode?: string, app_id?: string|null, app_secret?: string|null, verify_token?: string|null}  $payload
     */
    public function upsertForTenant(int|string $tenantId, array $payload): TenantMetaApp
    {
        $mode = strtolower(trim((string) ($payload['mode'] ?? TenantMetaApp::MODE_SHARED)));
        if (!in_array($mode, [TenantMetaApp::MODE_SHARED, TenantMetaApp::MODE_CUSTOM], true)) {
            throw ValidationException::withMessages([
                'mode' => ['Mode must be shared or custom.'],
            ]);
        }

        $existing = $this->findForTenant($tenantId);
        $previousMode = $existing?->mode ?? TenantMetaApp::MODE_SHARED;
        $previousAppId = $existing?->app_id;
        $previousHadSecret = filled($existing?->app_secret);

        $appId = array_key_exists('app_id', $payload)
            ? trim((string) ($payload['app_id'] ?? ''))
            : ($existing?->app_id ?? '');

        $verifyToken = array_key_exists('verify_token', $payload)
            ? trim((string) ($payload['verify_token'] ?? ''))
            : ($existing?->verify_token ?? '');

        if ($mode === TenantMetaApp::MODE_CUSTOM) {
            if ($appId === '') {
                throw ValidationException::withMessages([
                    'app_id' => ['App ID is required for custom Meta App mode.'],
                ]);
            }

            $incomingSecret = array_key_exists('app_secret', $payload)
                ? trim((string) ($payload['app_secret'] ?? ''))
                : '';

            $hasUsableSecret = $this->secrets->shouldPersistSecret($incomingSecret)
                || filled($existing?->app_secret);

            if (!$hasUsableSecret) {
                throw ValidationException::withMessages([
                    'app_secret' => ['App Secret is required for custom Meta App mode.'],
                ]);
            }
        }

        if ($verifyToken === '') {
            $verifyToken = Str::random(40);
        }

        $webhookKey = $existing?->webhook_key ?: (string) Str::uuid();

        $attributes = [
            'tenant_id' => $tenantId,
            'mode' => $mode,
            'app_id' => $appId !== '' ? $appId : null,
            'verify_token' => $verifyToken,
            'webhook_key' => $webhookKey,
            'is_active' => true,
        ];

        $secretChanged = false;
        if (array_key_exists('app_secret', $payload)) {
            $secret = trim((string) ($payload['app_secret'] ?? ''));
            if ($this->secrets->shouldPersistSecret($secret)) {
                $attributes['app_secret'] = $secret;
                $secretChanged = !$previousHadSecret || $secret !== (string) ($existing?->app_secret ?? '');
            }
        }

        $app = TenantMetaApp::withoutGlobalScopes()->updateOrCreate(
            ['tenant_id' => $tenantId],
            $attributes
        );

        $appIdChanged = (string) ($previousAppId ?? '') !== (string) ($appId ?? '');
        if ($previousMode !== $mode || $appIdChanged || $secretChanged) {
            $this->invalidateConnections($tenantId);
        }

        return $app->fresh() ?? $app;
    }

    public function switchToShared(int|string $tenantId): TenantMetaApp
    {
        return $this->upsertForTenant($tenantId, [
            'mode' => TenantMetaApp::MODE_SHARED,
        ]);
    }

    public function invalidateConnections(int|string $tenantId): int
    {
        return MetaConnection::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->update(['needs_reauth' => true]);
    }
}
