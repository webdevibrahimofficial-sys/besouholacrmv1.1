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
use App\Support\AppliesAgencyScope;

class MetaAuthController extends Controller
{
    use AppliesAgencyScope;

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

        $state = Str::random(64);
        Cache::put('meta_oauth_state:' . $state, [
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
            'agency_id' => $this->currentAgencyId($user),
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
            $agencyId = $this->currentAgencyId($user);

            if (!$tenantId) {
                $state = $request->input('state') ?? $request->query('state');
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
                $agencyId = trim((string) ($ctx['agency_id'] ?? '')) ?: null;
            }
            
            $this->credentialsResolver->resolveForTenant($tenantId);
            app()->instance('current_tenant_id', $tenantId);
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

        $connections = MetaConnection::where('tenant_id', $tenantId);
        $businesses = MetaBusiness::where('tenant_id', $tenantId);
        $adAccounts = MetaAdAccount::with('business')->where('tenant_id', $tenantId);
        $pages = MetaPage::where('tenant_id', $tenantId);

        $this->applyAgencyScope($connections, $user);
        $this->applyAgencyScope($businesses, $user);
        $this->applyAgencyScope($adAccounts, $user);
        $this->applyAgencyScope($pages, $user);
        
        $integration = Integration::where('tenant_id', $tenantId)->where('provider', 'meta')->first();
        $settings = $this->metaDefaultSettings($integration?->settings);
        $tenantHealth = app(\App\Services\MetaHealthService::class)->getTenantHealth($tenantId);

        return response()->json([
            'connected' => $connections->exists(),
            'shared_meta_configured' => $this->metaSystemSettings->isConfigured(),
            'integration_status' => $integration ? $integration->status : 'inactive',
            'settings' => $settings,
            'sync_warnings' => $tenantHealth['sync_warnings'] ?? [],
            'subscribe_summary' => $tenantHealth['subscribe_summary'] ?? [],
            'tenant_health' => $tenantHealth,
            'connections' => $connections->get(),
            'businesses' => $businesses->get(),
            'ad_accounts' => $adAccounts->get(),
            'pages' => $pages->get(),
        ]);
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
        
        if ($request->type === 'ad_account') {
            $assetQuery = MetaAdAccount::where('tenant_id', $tenantId);
            $this->applyAgencyScope($assetQuery, $user);
            $asset = $assetQuery->findOrFail($request->id);
            $asset->update(['is_active' => $request->is_active]);
        } else {
            $assetQuery = MetaPage::where('tenant_id', $tenantId);
            $this->applyAgencyScope($assetQuery, $user);
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
        $this->applyAgencyScope($pageQuery, $user);
        $page = $pageQuery->findOrFail($request->page_id);
        
        if ($request->ad_account_id) {
            // Verify ad account belongs to tenant
            $adAccountQuery = MetaAdAccount::where('tenant_id', $tenantId);
            $this->applyAgencyScope($adAccountQuery, $user);
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

        if ($request->type === 'business') {
            $businessQuery = MetaBusiness::where('tenant_id', $tenantId);
            $this->applyAgencyScope($businessQuery, $user);
            $asset = $businessQuery->findOrFail($request->id);
            // Optional: Check if it has ad accounts and warn? Or cascade delete?
            // Laravel relationships usually handle cascade if configured, otherwise we manual delete.
            // For now, let's just delete the business record. Ad Accounts might become orphaned or we should delete them too.
            // Ideally, we should delete children.
            MetaAdAccount::where('business_id', $asset->id)->delete();
            $asset->delete();
        } elseif ($request->type === 'ad_account') {
            $adAccountQuery = MetaAdAccount::where('tenant_id', $tenantId);
            $this->applyAgencyScope($adAccountQuery, $user);
            $asset = $adAccountQuery->findOrFail($request->id);
            $asset->delete();
        } elseif ($request->type === 'page') {
            $pageQuery = MetaPage::where('tenant_id', $tenantId);
            $this->applyAgencyScope($pageQuery, $user);
            $asset = $pageQuery->findOrFail($request->id);
            $asset->delete();
        }

        return response()->json(['message' => 'Asset deleted successfully']);
    }

    public function disconnect(Request $request)
    {
        $user = $request->user();
        $connectionId = $request->input('connection_id');

        if ($connectionId) {
            $query = MetaConnection::where('tenant_id', $user->tenant_id)->where('id', $connectionId);
            $this->applyAgencyScope($query, $user);
            $query->delete();
        } else {
            // Disconnect all if no specific ID
            $query = MetaConnection::where('tenant_id', $user->tenant_id);
            $this->applyAgencyScope($query, $user);
            $query->delete();
        }

        // Check if any connections remain
        $remainingQuery = MetaConnection::where('tenant_id', $user->tenant_id);
        $this->applyAgencyScope($remainingQuery, $user);
        $remainingConnections = $remainingQuery->exists();

        if (!$remainingConnections) {
            $pageDelete = MetaPage::where('tenant_id', $user->tenant_id);
            $adDelete = MetaAdAccount::where('tenant_id', $user->tenant_id);
            $businessDelete = MetaBusiness::where('tenant_id', $user->tenant_id);
            $this->applyAgencyScope($pageDelete, $user);
            $this->applyAgencyScope($adDelete, $user);
            $this->applyAgencyScope($businessDelete, $user);
            $pageDelete->delete();
            $adDelete->delete();
            $businessDelete->delete();
            Integration::updateOrCreate(
                ['tenant_id' => $user->tenant_id, 'provider' => 'meta'],
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
}
