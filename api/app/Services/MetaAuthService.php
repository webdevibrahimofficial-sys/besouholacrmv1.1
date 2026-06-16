<?php

namespace App\Services;

use App\Jobs\SyncMetaAssets;
use App\Contracts\MetaApiClientInterface;
use App\Models\Integration;
use App\Models\MetaConnection;
use App\Models\MetaBusiness;
use App\Models\MetaAdAccount;
use App\Models\MetaPage;
use App\Services\TenantMetaCredentialsResolver;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\FacebookProvider;

class MetaAuthService
{
    protected $redirectUri;
    protected $apiVersion = 'v19.0';
    protected $apiClient;
    protected $credentialsResolver;

    public function __construct(MetaApiClientInterface $apiClient, TenantMetaCredentialsResolver $credentialsResolver)
    {
        $this->apiClient = $apiClient;
        $this->credentialsResolver = $credentialsResolver;
        $this->redirectUri = config('services.facebook.redirect');
    }

    protected function resolveCredentials($tenantId): array
    {
        return $this->credentialsResolver->resolveForTenant($tenantId);
    }

    protected function socialiteDriver($tenantId): FacebookProvider
    {
        $credentials = $this->resolveCredentials($tenantId);

        /** @var FacebookProvider $driver */
        $driver = Socialite::buildProvider(FacebookProvider::class, [
            'client_id' => $credentials['app_id'],
            'client_secret' => $credentials['app_secret'],
            'redirect' => $this->redirectUri,
        ]);

        return $driver;
    }

    protected function minimalOauthScopesEnabled(): bool
    {
        return filter_var(config('services.meta.oauth_minimal_scopes', false), FILTER_VALIDATE_BOOL);
    }

    protected function resolveOauthScopes(): array
    {
        if ($this->minimalOauthScopesEnabled()) {
            return config('services.facebook.minimal_scopes', [
                'public_profile',
                'email',
            ]);
        }

        return config('services.facebook.scopes', [
            'public_profile',
            'email',
            'pages_show_list',
            'pages_read_engagement',
            'ads_read',
            'leads_retrieval',
            'business_management',
            'pages_manage_metadata',
        ]);
    }

    protected function logRedirectAttempt($tenantId, array $credentials, array $scopes): void
    {
        Log::info('Meta OAuth redirect initiated', [
            'tenant_id' => $tenantId,
            'app_id' => $credentials['app_id'] ?? null,
            'redirect_uri' => $this->redirectUri,
            'scopes' => $scopes,
            'minimal_scope_mode' => $this->minimalOauthScopesEnabled(),
        ]);
    }

    public function getRedirectUrl($tenantId = null, ?string $state = null)
    {
        // Mock Mode Check for Redirect URL
        if (config('services.meta.mock_mode')) {
            // Return a mock redirect URL that front-end can handle or just loop back
            $params = ['code' => 'mock_code_' . uniqid()];
            if ($state) {
                $params['state'] = $state;
            }
            return route('meta.callback', $params);
        }

        $credentials = $this->resolveCredentials($tenantId);
        $driver = $this->socialiteDriver($tenantId);
        $scopes = $this->resolveOauthScopes();

        $this->logRedirectAttempt($tenantId, $credentials, $scopes);

        $driver = $driver
            ->stateless()
            ->scopes($scopes)
        ;

        if ($state) {
            $driver = $driver->with(['state' => $state]);
        }

        return $driver->redirect()->getTargetUrl();
    }

    public function handleSocialUser($tenantId, $socialUser, ?string $agencyId = null)
    {
        try {
            // Exchange short-lived token for long-lived token
            // In Mock Mode, socialUser might be a mock object or array
            $token = is_object($socialUser) ? $socialUser->token : ($socialUser['token'] ?? 'mock_token');
            $userId = is_object($socialUser) ? $socialUser->id : ($socialUser['id'] ?? 'mock_user_id');
            $userName = is_object($socialUser) ? $socialUser->name : ($socialUser['name'] ?? 'Mock User');
            $userEmail = is_object($socialUser) ? $socialUser->email : ($socialUser['email'] ?? 'mock@example.com');

            $longLivedTokenData = $this->exchangeForLongLivedToken($token, $tenantId);
            $longLivedToken = $longLivedTokenData['access_token'] ?? $token;
            $expiresIn = $longLivedTokenData['expires_in'] ?? null;
            $expiresAt = $expiresIn ? now()->addSeconds($expiresIn) : null;

            // 1. Create/Update Integration (Generic)
            Integration::firstOrCreate(
                ['tenant_id' => $tenantId, 'provider' => 'meta'],
                ['status' => 'active', 'settings' => ['autoSync' => true]]
            );

            // 2. Store Meta Connection (OAuth User)
            $connection = MetaConnection::updateOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'fb_user_id' => $userId,
                ],
                [
                    'agency_id' => $agencyId,
                    'user_access_token' => $longLivedToken,
                    'expires_at' => $expiresAt,
                    'name' => $userName,
                    'email' => $userEmail,
                ]
            );

            // 3. Fetch and Store Assets asynchronously so OAuth callback is not blocked.
            SyncMetaAssets::dispatch($tenantId, $connection->id);

            return $connection;

        } catch (\Exception $e) {
            Log::error("Meta Auth Error: " . $e->getMessage());
            throw $e;
        }
    }

    public function syncAssets(MetaConnection $connection)
    {
        $accessToken = $connection->user_access_token;
        $tenantId = $connection->tenant_id;
        $agencyId = $connection->agency_id;

        // A. Fetch Businesses
        try {
            $businesses = $this->fetchGraphApi('/me/businesses', $accessToken);
        } catch (\Exception $e) {
             Log::error("Failed to fetch businesses: " . $e->getMessage());
             $businesses = [];
        }
        
        foreach ($businesses as $bizData) {
            $business = MetaBusiness::updateOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'fb_business_id' => $bizData['id'],
                ],
                [
                    'connection_id' => $connection->id,
                    'agency_id' => $agencyId,
                    'business_name' => $bizData['name'],
                ]
            );

            // B. Fetch Ad Accounts for this Business
            try {
                $adAccounts = $this->fetchGraphApi("/{$business->fb_business_id}/owned_ad_accounts", $accessToken, ['fields' => 'account_id,name,currency,timezone']);
            } catch (\Exception $e) {
                Log::error("Failed to fetch ad accounts for business {$business->fb_business_id}: " . $e->getMessage());
                $adAccounts = [];
            }
            
            foreach ($adAccounts as $adData) {
                $adAccountId = \App\Models\MetaAdAccount::normalizeAdAccountId((string) ($adData['id'] ?? $adData['account_id'] ?? ''));
                if ($adAccountId === '') {
                    continue;
                }
                MetaAdAccount::updateOrCreate(
                    [
                        'tenant_id' => $tenantId,
                        'ad_account_id' => $adAccountId, // e.g., act_123456
                    ],
                    [
                        'business_id' => $business->id,
                        'agency_id' => $agencyId,
                        'name' => $adData['name'] ?? 'Unnamed Ad Account',
                        'currency' => $adData['currency'] ?? 'USD',
                        'timezone' => $adData['timezone'] ?? 'UTC',
                        'is_active' => true,
                    ]
                );
            }
        }

        // C. Fetch Pages (User's accounts)
        try {
            $pages = $this->fetchGraphApi('/me/accounts', $accessToken, ['fields' => 'id,name,access_token,instagram_business_account']);
        } catch (\Exception $e) {
             Log::error("Failed to fetch pages: " . $e->getMessage());
             $pages = [];
        }

        foreach ($pages as $pageData) {
            MetaPage::updateOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'page_id' => $pageData['id'],
                ],
                [
                    'connection_id' => $connection->id,
                    'agency_id' => $agencyId,
                    'page_name' => $pageData['name'],
                    'page_token' => $pageData['access_token'], // Long-lived page token
                    'instagram_business_account_id' => $pageData['instagram_business_account']['id'] ?? null,
                    'is_active' => true,
                ]
            );
        }
    }

    protected function fetchGraphApi($endpoint, $token, $params = [])
    {
        $allData = [];
        $params['access_token'] = $token;
        $params['limit'] = 100;

        do {
            $data = $this->apiClient->get($endpoint, $params);

            if (isset($data['data'])) {
                $allData = array_merge($allData, $data['data']);
            }

            // Pagination
            $nextUrl = $data['paging']['next'] ?? null;
            if ($nextUrl) {
                $endpoint = $nextUrl;
                $params = [];
            } else {
                $endpoint = null;
            }

        } while ($endpoint);

        return $allData;
    }


    public function handleCallback($tenantId, ?string $agencyId = null)
    {
        if (config('services.meta.mock_mode')) {
             $mockUser = (object) [
                'id' => 'mock_user_' . uniqid(),
                'name' => 'Mock User',
                'email' => 'mock@example.com',
                'token' => 'mock_access_token_' . uniqid(),
             ];
             return $this->handleSocialUser($tenantId, $mockUser, $agencyId);
        }

        $driver = $this->socialiteDriver($tenantId);
        $user = $driver->stateless()->user();
        return $this->handleSocialUser($tenantId, $user, $agencyId);
    }

    public function refreshAllTokens($tenantId)
    {
        $connections = MetaConnection::where('tenant_id', $tenantId)->get();
        
        foreach ($connections as $connection) {
            $this->refreshToken($connection);
        }
        
        return true;
    }

    public function refreshToken(MetaConnection $connection)
    {
        try {
            // Refresh logic: Exchange current long-lived token for a new one
            $newTokenData = $this->exchangeForLongLivedToken($connection->user_access_token, $connection->tenant_id);
            
            if (empty($newTokenData) || !isset($newTokenData['access_token'])) {
                Log::warning("Failed to refresh token for connection {$connection->id}");
                return false;
            }

            $longLivedToken = $newTokenData['access_token'];
            $expiresIn = $newTokenData['expires_in'] ?? null; // seconds
            $expiresAt = $expiresIn ? now()->addSeconds($expiresIn) : null;

            $connection->update([
                'user_access_token' => $longLivedToken,
                'expires_at' => $expiresAt,
            ]);

            Log::info("Refreshed Meta token for connection {$connection->id}");
            return true;

        } catch (\Exception $e) {
            Log::error("Error refreshing token for connection {$connection->id}: " . $e->getMessage());
            return false;
        }
    }

    public function exchangeForLongLivedToken($shortLivedToken, $tenantId = null)
    {
        // Use apiClient instead of direct Http call to support mock mode
        if (!$tenantId) {
            $tenantId = app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
        }
        $credentials = $this->resolveCredentials($tenantId);
        try {
            return $this->apiClient->get('/oauth/access_token', [
                'grant_type' => 'fb_exchange_token',
                'client_id' => $credentials['app_id'],
                'client_secret' => $credentials['app_secret'],
                'fb_exchange_token' => $shortLivedToken,
            ]);
        } catch (\Exception $e) {
            Log::error("Failed to exchange token: " . $e->getMessage());
            return [];
        }
    }

    public function getAccessToken($tenantId)
    {
        $connection = $this->resolveFallbackConnection($tenantId, false);

        if ($connection) {
            return $connection->user_access_token;
        }

        // If no valid token, try to find a single expired connection and refresh it.
        $connection = $this->resolveFallbackConnection($tenantId, true);
        
        if ($connection) {
            if ($this->refreshToken($connection)) {
                return $connection->fresh()->user_access_token;
            }
        }

        return null;
    }

    protected function resolveFallbackConnection($tenantId, bool $includeExpired): ?MetaConnection
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

    public function subscribePageToLeadgenWebhook(string $pageId, string $pageToken): array
    {
        if (config('services.meta.mock_mode')) {
            return ['ok' => true, 'mock' => true];
        }

        $url = "https://graph.facebook.com/{$this->apiVersion}/{$pageId}/subscribed_apps";

        $response = Http::asForm()->post($url, [
            'subscribed_fields' => 'leadgen',
            'access_token' => $pageToken,
        ]);

        if (!($response instanceof Response)) {
            throw new \RuntimeException('Meta subscribe failed: invalid response');
        }

        if ($response->failed()) {
            throw new \RuntimeException('Meta subscribe failed: ' . $response->body());
        }

        $json = $response->json();
        return is_array($json) ? $json : ['ok' => true];
    }

    public function unsubscribePageFromLeadgenWebhook(string $pageId, string $pageToken): array
    {
        if (config('services.meta.mock_mode')) {
            return ['ok' => true, 'mock' => true];
        }

        $url = "https://graph.facebook.com/{$this->apiVersion}/{$pageId}/subscribed_apps";

        $response = Http::asForm()->delete($url, [
            'access_token' => $pageToken,
        ]);

        if (!($response instanceof Response)) {
            throw new \RuntimeException('Meta unsubscribe failed: invalid response');
        }

        if ($response->failed()) {
            throw new \RuntimeException('Meta unsubscribe failed: ' . $response->body());
        }

        $json = $response->json();
        return is_array($json) ? $json : ['ok' => true];
    }
}
