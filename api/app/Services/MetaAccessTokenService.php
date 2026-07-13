<?php

namespace App\Services;

use App\Contracts\MetaApiClientInterface;
use App\Models\MetaAdAccount;
use App\Models\MetaConnection;
use Illuminate\Support\Facades\Log;

class MetaAccessTokenService
{
    public function __construct(
        protected MetaApiClientInterface $apiClient,
        protected MetaCredentialsResolver $credentialsResolver,
        protected MetaConnectionNotifier $connectionNotifier
    ) {
    }

    public function getTenantAccessToken(int|string $tenantId): ?string
    {
        $connection = $this->resolveFallbackConnection($tenantId, false);

        if ($connection) {
            return $connection->user_access_token;
        }

        $connection = $this->resolveFallbackConnection($tenantId, true);

        if ($connection && $this->refreshConnection($connection)) {
            return $connection->fresh()->user_access_token;
        }

        return null;
    }

    public function getAdAccountAccessToken(MetaAdAccount $adAccount): ?string
    {
        if ($adAccount->access_token) {
            return $adAccount->access_token;
        }

        $token = $this->getTenantAccessToken($adAccount->tenant_id);

        if (!$token && config('services.meta.mock_mode')) {
            return 'mock_access_token_campaign_sync';
        }

        return $token;
    }

    public function resolveFallbackConnection(int|string $tenantId, bool $includeExpired = false): ?MetaConnection
    {
        $query = MetaConnection::where('tenant_id', $tenantId);

        if (!$includeExpired) {
            $query->where(function ($builder) {
                $builder->whereNull('expires_at')
                    ->orWhere('expires_at', '>', now());
            });
        }

        $connections = $query
            ->orderByDesc('updated_at')
            ->limit(2)
            ->get();

        if ($connections->count() > 1) {
            Log::warning('Meta access token fallback is ambiguous for tenant with multiple connections.', [
                'tenant_id' => $tenantId,
                'include_expired' => $includeExpired,
                'connection_ids' => $connections->pluck('id')->all(),
            ]);

            return null;
        }

        return $connections->first();
    }

    public function refreshConnection(MetaConnection $connection): bool
    {
        try {
            $newTokenData = $this->exchangeForLongLivedToken(
                $connection->user_access_token,
                $connection->tenant_id
            );

            if (empty($newTokenData) || !isset($newTokenData['access_token'])) {
                Log::warning("Failed to refresh token for connection {$connection->id}");
                $this->connectionNotifier->notifyTokenIssue($connection, 'Automatic Meta token refresh failed. Please reconnect your account.');
                return false;
            }

            $longLivedToken = $newTokenData['access_token'];
            $expiresIn = $newTokenData['expires_in'] ?? null;
            $expiresAt = $expiresIn ? now()->addSeconds($expiresIn) : null;

            $connection->update([
                'user_access_token' => $longLivedToken,
                'expires_at' => $expiresAt,
            ]);

            Log::info("Refreshed Meta token for connection {$connection->id}");
            return true;
        } catch (\Exception $e) {
            Log::error("Error refreshing token for connection {$connection->id}: " . $e->getMessage());
            $this->connectionNotifier->notifyTokenIssue($connection, $e->getMessage());
            return false;
        }
    }

    public function exchangeForLongLivedToken(string $shortLivedToken, int|string|null $tenantId = null): array
    {
        if (!$tenantId) {
            $tenantId = app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
        }

        $credentials = $this->credentialsResolver->resolveForTenant($tenantId);

        try {
            return $this->apiClient->get('/oauth/access_token', [
                'grant_type' => 'fb_exchange_token',
                'client_id' => $credentials['app_id'],
                'client_secret' => $credentials['app_secret'],
                'fb_exchange_token' => $shortLivedToken,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to exchange token: ' . $e->getMessage());
            return [];
        }
    }
}
