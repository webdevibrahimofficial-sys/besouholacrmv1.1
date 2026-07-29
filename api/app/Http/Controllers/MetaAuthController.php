<?php

namespace App\Http\Controllers;

use App\Services\MetaAuthService;
use App\Services\MetaCampaignService;
use App\Jobs\SyncMetaCampaigns;
use App\Models\MetaConnection;
use App\Models\MetaBusiness;
use App\Models\MetaAdAccount;
use App\Models\MetaPage;
use App\Models\Integration;
use App\Models\Tenant;
use App\Models\User;
use App\Services\MetaSystemSettingsService;
use App\Services\MetaCredentialsResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use App\Support\AppliesMetaAgencyScope;

class MetaAuthController extends Controller
{
    use AppliesMetaAgencyScope;

    protected MetaAuthService $metaAuthService;
    protected MetaCredentialsResolver $credentialsResolver;
    protected MetaSystemSettingsService $metaSystemSettings;

    public function __construct(
        MetaAuthService $metaAuthService,
        MetaCredentialsResolver $credentialsResolver,
        MetaSystemSettingsService $metaSystemSettings
    )
    {
        $this->metaAuthService = $metaAuthService;
        $this->credentialsResolver = $credentialsResolver;
        $this->metaSystemSettings = $metaSystemSettings;
    }

    public function redirect(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $targetAgency = $this->resolveTargetAgencyId($request, $user);
        if ($targetAgency['error']) {
            return response()->json(['error' => $targetAgency['error']], 422);
        }

        if ($this->hasExistingConnection($user->tenant_id, $targetAgency['agency_id'])) {
            return response()->json([
                'error' => 'This agency already has a connected Meta account. Disconnect it first before connecting another.',
            ], 409);
        }

        $state = Str::random(64);
        Cache::put('meta_oauth_state:' . $state, [
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
            'agency_id' => $targetAgency['agency_id'],
        ], now()->addMinutes(10));

        try {
            $this->credentialsResolver->resolveForTenant($user->tenant_id);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Meta integration is not enabled. Please ask your system administrator to configure the shared Meta App.',
            ], 422);
        }

        $url = $this->metaAuthService->getRedirectUrl($user->tenant_id, $state);
        return response()->json(['url' => $url]);
    }

    public function callback(Request $request)
    {
        try {
            $user = $request->user();
            $tenantId = $user?->tenant_id;
            $agencyId = $this->normalizeMetaAgencyKey($user?->agency_id);
            $state = $request->input('state') ?? $request->query('state');

            if ($state) {
                $ctx = Cache::get('meta_oauth_state:' . $state);
                if (is_array($ctx) && !empty($ctx['tenant_id']) && !empty($ctx['user_id'])) {
                    $stateUser = User::find($ctx['user_id']);
                    if ($stateUser && (string) $stateUser->tenant_id === (string) $ctx['tenant_id']) {
                        $user = $stateUser;
                        $tenantId = $ctx['tenant_id'];
                        $agencyId = $this->normalizeMetaAgencyKey($ctx['agency_id'] ?? null);
                    }
                }
            }

            if (!$tenantId) {
                if (!$state) {
                    return response()->json(['error' => 'Missing state'], 422);
                }

                $ctx = Cache::pull('meta_oauth_state:' . $state);
                if (!is_array($ctx) || empty($ctx['tenant_id']) || empty($ctx['user_id'])) {
                    return response()->json(['error' => 'Invalid or expired state'], 403);
                }

                $user = User::find($ctx['user_id']);
                if (!$user || (string) $user->tenant_id !== (string) $ctx['tenant_id']) {
                    return response()->json(['error' => 'Unauthorized'], 401);
                }

                $tenantId = $ctx['tenant_id'];
                $agencyId = $this->normalizeMetaAgencyKey($ctx['agency_id'] ?? null);
            } elseif ($state) {
                Cache::forget('meta_oauth_state:' . $state);
            }
            
            $this->credentialsResolver->resolveForTenant($tenantId);
            app()->instance('current_tenant_id', $tenantId);

            if ($this->hasExistingConnection($tenantId, $agencyId)) {
                $message = 'This agency already has a connected Meta account. Disconnect it first before connecting another.';

                if ($request->expectsJson()) {
                    return response()->json(['error' => $message], 409);
                }

                $frontendBase = config('app.frontend_url', 'https://besouholacrm.net');
                return redirect()->away($frontendBase . '/#/marketing/meta-integration?meta=already_connected');
            }

            $connection = $this->metaAuthService->handleCallback($tenantId, $agencyId);
            
            // Ensure Integration record exists and is active
            Integration::updateOrCreate(
                ['tenant_id' => $tenantId, 'provider' => 'meta'],
                ['status' => 'active']
            );

            // Trigger initial sync
            SyncMetaCampaigns::dispatch($tenantId);

            $frontendBase = config('app.frontend_url', 'https://besouholacrm.net');
            $frontendHost = parse_url($frontendBase, PHP_URL_HOST) ?? 'besouholacrm.net';
            $frontendScheme = parse_url($frontendBase, PHP_URL_SCHEME) ?? 'https';
            $frontendPort = parse_url($frontendBase, PHP_URL_PORT);
            $portSuffix = $frontendPort ? ':' . $frontendPort : '';
            $tenant = Tenant::find($tenantId);
            $redirectBase = $tenant?->slug ? ($frontendScheme . '://' . $tenant->slug . '.' . $frontendHost . $portSuffix) : $frontendBase;

            $payload = ['message' => 'Meta connected successfully', 'connection' => $connection];
            if ($request->expectsJson()) {
                return response()->json($payload);
            }

            return redirect()->away($redirectBase . '/#/marketing/meta-integration?meta=connected');

        } catch (\Exception $e) {
            Log::error("Meta Auth Callback Error: " . $e->getMessage());
            if ($request->expectsJson()) {
                return response()->json(['error' => 'Failed to connect Meta account'], 500);
            }

            $frontendBase = config('app.frontend_url', 'https://besouholacrm.net');
            return redirect()->away($frontendBase . '/#/marketing/meta-integration?meta=error');
        }
    }
    
    public function status(Request $request)
    {
        $user = $request->user();
        $tenantId = $user->tenant_id;
        $agencyFilter = $this->resolveMetaAgencyFilter($request, $user);

        $connections = MetaConnection::where('tenant_id', $tenantId);
        $businesses = MetaBusiness::where('tenant_id', $tenantId);
        $adAccounts = MetaAdAccount::with('business')->where('tenant_id', $tenantId);
        $pages = MetaPage::where('tenant_id', $tenantId);

        $this->applyMetaAgencyFilter($connections, $agencyFilter);
        $this->applyMetaAgencyFilter($businesses, $agencyFilter);
        $this->applyMetaAgencyFilter($adAccounts, $agencyFilter);
        $this->applyMetaAgencyFilter($pages, $agencyFilter);
        
        $integration = Integration::where('tenant_id', $tenantId)->where('provider', 'meta')->first();
        $settings = $this->metaDefaultSettings($integration?->settings);
        $metaHealth = app(\App\Services\MetaHealthService::class);
        $tenantHealth = $metaHealth->getTenantHealth($tenantId);
        $attention = $metaHealth->getTenantAttention($tenantId);
        $goLive = $metaHealth->getTenantGoLiveChecklist($tenantId);

        return response()->json([
            'connected' => $connections->exists(),
            'shared_meta_configured' => $this->metaSystemSettings->isConfigured(),
            'integration_status' => $integration ? $integration->status : 'inactive',
            'settings' => $settings,
            'sync_warnings' => $tenantHealth['sync_warnings'] ?? [],
            'subscribe_summary' => $tenantHealth['subscribe_summary'] ?? [],
            'tenant_health' => $tenantHealth,
            'attention' => $attention,
            'go_live' => $goLive,
            'meta_agency' => [
                'filter' => $agencyFilter,
                'can_select_agency' => $this->isMetaTenantAdmin($user),
                'locked_agency_id' => (!$this->isMetaTenantAdmin($user) && filled($user->agency_id))
                    ? $this->normalizeMetaAgencyKey($user->agency_id)
                    : null,
            ],
            'connections' => $connections->get(),
            'businesses' => $businesses->get(),
            'ad_accounts' => $adAccounts->get(),
            'pages' => $pages->get(),
        ]);
    }

    protected function hasExistingConnection(int|string $tenantId, ?string $agencyId = null): bool
    {
        return $this->hasMetaConnectionForAgency($tenantId, $agencyId);
    }

    public function health(Request $request)
    {
        $user = $request->user();
        $tenantId = $user->tenant_id;

        return response()->json(
            app(\App\Services\MetaHealthService::class)->getTenantHealth($tenantId)
        );
    }
    
    public function updateSettings(Request $request)
    {
        $user = $request->user();
        $tenantId = $user->tenant_id;
        $integration = Integration::updateOrCreate(
            ['tenant_id' => $tenantId, 'provider' => 'meta'],
            ['status' => 'active']
        );

        $validated = $request->validate([
            'settings' => 'required|array',
        ]);

        $settings = $this->metaDefaultSettings($integration->settings);
        $integration->settings = array_merge($settings, $validated['settings']);
        $integration->save();

        return response()->json(['message' => 'Settings updated successfully']);
    }

    protected function metaDefaultSettings($settings = null): array
    {
        $current = is_array($settings) ? $settings : [];

        return array_merge([
            'autoSync' => true,
        ], $current);
    }

    public function toggleAsset(Request $request)
    {
        $request->validate([
            'type' => 'required|in:ad_account,page',
            'id' => 'required|integer',
            'is_active' => 'required|boolean'
        ]);

        $user = $request->user();
        $tenantId = $user->tenant_id;
        $agencyFilter = $this->resolveMetaAgencyFilter($request, $user);
        
        if ($request->type === 'ad_account') {
            $assetQuery = MetaAdAccount::where('tenant_id', $tenantId);
            $this->applyMetaAgencyFilter($assetQuery, $agencyFilter);
            $asset = $assetQuery->findOrFail($request->id);
            $asset->update(['is_active' => $request->is_active]);
        } else {
            $assetQuery = MetaPage::where('tenant_id', $tenantId);
            $this->applyMetaAgencyFilter($assetQuery, $agencyFilter);
            $asset = $assetQuery->findOrFail($request->id);
            $asset->update(['is_active' => $request->is_active]);
            $this->syncPageWebhookSubscription($asset, (bool) $request->is_active);
        }

        return response()->json(['message' => 'Asset status updated successfully', 'asset' => $asset]);
    }

    protected function syncPageWebhookSubscription(MetaPage $page, bool $isActive): void
    {
        try {
            if ($isActive) {
                $this->metaAuthService->subscribePageToLeadgenWebhook($page->page_id, $page->page_token);
                Log::info("Subscribed page {$page->page_id} to webhook successfully.");
                return;
            }

            $this->metaAuthService->unsubscribePageFromLeadgenWebhook($page->page_id, $page->page_token);
        } catch (\Throwable $e) {
            $logMethod = $isActive ? 'error' : 'warning';
            Log::$logMethod(
                sprintf(
                    'Failed to %s page %s webhook subscription: %s',
                    $isActive ? 'subscribe' : 'unsubscribe',
                    $page->page_id,
                    $e->getMessage()
                )
            );
        }
    }

    public function linkPage(Request $request)
    {
        $request->validate([
            'page_id' => 'required|integer|exists:meta_pages,id',
            'ad_account_id' => 'nullable|integer|exists:meta_ad_accounts,id'
        ]);

        $user = $request->user();
        $tenantId = $user->tenant_id;

        $pageQuery = MetaPage::where('tenant_id', $tenantId);
        $this->applyMetaAgencyFilter($pageQuery, $this->resolveMetaAgencyFilter($request, $user));
        $page = $pageQuery->findOrFail($request->page_id);
        
        if ($request->ad_account_id) {
            // Verify ad account belongs to tenant
            $adAccountQuery = MetaAdAccount::where('tenant_id', $tenantId);
            $this->applyMetaAgencyFilter($adAccountQuery, $this->resolveMetaAgencyFilter($request, $user));
            $adAccount = $adAccountQuery->findOrFail($request->ad_account_id);
            $page->update(['ad_account_id' => $adAccount->id]);
        } else {
            $page->update(['ad_account_id' => null]);
        }

        return response()->json(['message' => 'Page linked successfully', 'page' => $page]);
    }

    public function deleteAsset(Request $request)
    {
        $request->validate([
            'type' => 'required|in:business,ad_account,page',
            'id' => 'required|integer',
        ]);

        $user = $request->user();
        $tenantId = $user->tenant_id;
        $agencyFilter = $this->resolveMetaAgencyFilter($request, $user);

        if ($request->type === 'business') {
            $businessQuery = MetaBusiness::where('tenant_id', $tenantId);
            $this->applyMetaAgencyFilter($businessQuery, $agencyFilter);
            $asset = $businessQuery->findOrFail($request->id);
            // Optional: Check if it has ad accounts and warn? Or cascade delete?
            // Laravel relationships usually handle cascade if configured, otherwise we manual delete.
            // For now, let's just delete the business record. Ad Accounts might become orphaned or we should delete them too.
            // Ideally, we should delete children.
            MetaAdAccount::where('business_id', $asset->id)->delete();
            $asset->delete();
        } elseif ($request->type === 'ad_account') {
            $adAccountQuery = MetaAdAccount::where('tenant_id', $tenantId);
            $this->applyMetaAgencyFilter($adAccountQuery, $agencyFilter);
            $asset = $adAccountQuery->findOrFail($request->id);
            $asset->delete();
        } elseif ($request->type === 'page') {
            $pageQuery = MetaPage::where('tenant_id', $tenantId);
            $this->applyMetaAgencyFilter($pageQuery, $agencyFilter);
            $asset = $pageQuery->findOrFail($request->id);
            $asset->delete();
        }

        return response()->json(['message' => 'Asset deleted successfully']);
    }

    public function disconnect(Request $request)
    {
        $user = $request->user();
        $tenantId = $user->tenant_id;
        $connectionId = $request->input('connection_id');
        $agencyFilter = $this->resolveMetaAgencyFilter($request, $user);
        $disconnectedAgencyIds = [];

        if ($connectionId) {
            $query = MetaConnection::where('tenant_id', $tenantId)->where('id', $connectionId);
            $this->applyMetaAgencyFilter($query, $agencyFilter);
            $connection = $query->firstOrFail();
            $disconnectedAgencyIds[] = $this->normalizeMetaAgencyKey($connection->agency_id);
            $connection->delete();
        } else {
            $query = MetaConnection::where('tenant_id', $tenantId);
            $this->applyMetaAgencyFilter($query, $agencyFilter);
            $disconnectedAgencyIds = $query->pluck('agency_id')
                ->map(fn ($agencyId) => $this->normalizeMetaAgencyKey($agencyId))
                ->unique()
                ->values()
                ->all();
            $query->delete();
        }

        foreach ($disconnectedAgencyIds as $agencyId) {
            if (!$this->hasExistingConnection($tenantId, $agencyId)) {
                $this->deleteMetaAssetsForAgency($tenantId, $agencyId);
            }
        }

        $remainingConnections = MetaConnection::where('tenant_id', $tenantId)->exists();
        if (!$remainingConnections) {
            Integration::updateOrCreate(
                ['tenant_id' => $tenantId, 'provider' => 'meta'],
                ['status' => 'inactive']
            );
        }
        
        return response()->json(['message' => 'Meta disconnected successfully']);
    }

    public function sync(Request $request)
    {
        $user = $request->user();
        
        try {
            // Dispatch job for background processing
            SyncMetaCampaigns::dispatch($user->tenant_id);
            
            return response()->json(['message' => 'Sync started successfully']);
        } catch (\Exception $e) {
            Log::error("Meta Sync Error: " . $e->getMessage());
            return response()->json(['error' => 'Failed to start sync'], 500);
        }
    }

    public function testWebhook(Request $request)
    {
        $credentials = $this->metaSystemSettings->resolveSharedCredentials();
        $verifyToken = $credentials['verify_token'] ?? '';
        $webhookUrl = rtrim((string) config('app.url'), '/') . '/api/meta/webhook';

        if ($verifyToken === '') {
            return response()->json([
                'ok' => false,
                'message' => 'Webhook verify token is not configured by the system administrator.',
            ], 422);
        }

        $internalRequest = Request::create('/api/meta/webhook', 'GET', [
            'hub.mode' => 'subscribe',
            'hub.verify_token' => $verifyToken,
            'hub.challenge' => 'TENANT_META_TEST',
        ]);
        $internalResponse = app()->handle($internalRequest);
        $body = trim((string) $internalResponse->getContent());
        $ok = $internalResponse->getStatusCode() === 200 && $body === 'TENANT_META_TEST';

        return response()->json([
            'ok' => $ok,
            'webhook_url' => $webhookUrl,
            'status' => $internalResponse->getStatusCode(),
            'message' => $ok
                ? 'Webhook endpoint is reachable and verification succeeded.'
                : 'Webhook verification failed. Contact your system administrator.',
        ], $ok ? 200 : 422);
    }
}
