<?php

namespace App\Http\Controllers;

use App\Services\MetaAuthService;
use App\Services\MetaCampaignService;
use App\Jobs\SyncMetaCampaigns;
use App\Models\MetaConnection;
use App\Models\MetaBusiness;
use App\Models\MetaAdAccount;
use App\Models\MetaPage;
use App\Models\TenantMetaApp;
use App\Models\Integration;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantMetaCredentialsResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class MetaAuthController extends Controller
{
    protected MetaAuthService $metaAuthService;
    protected TenantMetaCredentialsResolver $credentialsResolver;

    public function __construct(MetaAuthService $metaAuthService, TenantMetaCredentialsResolver $credentialsResolver)
    {
        $this->metaAuthService = $metaAuthService;
        $this->credentialsResolver = $credentialsResolver;
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
        ], now()->addMinutes(10));

        try {
            $this->credentialsResolver->resolveForTenant($user->tenant_id);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Tenant Meta App is not configured. Please configure tenant app settings first.',
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
            }
            
            $this->credentialsResolver->resolveForTenant($tenantId);
            app()->instance('current_tenant_id', $tenantId);
            $connection = $this->metaAuthService->handleCallback($tenantId);
            
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

        $connections = MetaConnection::where('tenant_id', $tenantId)->get();
        $businesses = MetaBusiness::where('tenant_id', $tenantId)->get();
        $adAccounts = MetaAdAccount::with('business')->where('tenant_id', $tenantId)->get();
        $pages = MetaPage::where('tenant_id', $tenantId)->get();
        
        $integration = Integration::where('tenant_id', $tenantId)->where('provider', 'meta')->first();

        return response()->json([
            'connected' => $connections->isNotEmpty(),
            'integration_status' => $integration ? $integration->status : 'inactive',
            'connections' => $connections,
            'businesses' => $businesses,
            'ad_accounts' => $adAccounts,
            'pages' => $pages,
        ]);
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

        $settings = is_array($integration->settings) ? $integration->settings : [];
        $integration->settings = array_merge($settings, $validated['settings']);
        $integration->save();

        return response()->json(['message' => 'Settings updated successfully']);
    }

    public function appSettings(Request $request)
    {
        $this->ensureMetaSettingsAccess($request->user());
        $tenantId = $request->user()->tenant_id;
        $record = TenantMetaApp::where('tenant_id', $tenantId)->first();

        $webhookBase = rtrim(config('app.url'), '/');
        $webhookPath = $record?->webhook_key
            ? "/api/meta/webhook/{$record->webhook_key}"
            : null;

        return response()->json([
            'app_id' => $record?->app_id,
            'app_secret_masked' => $record?->masked_app_secret,
            'verify_token_set' => !empty($record?->verify_token),
            'webhook_key' => $record?->webhook_key,
            'webhook_url' => $webhookPath ? ($webhookBase . $webhookPath) : null,
            'is_active' => (bool) ($record?->is_active ?? false),
            'source' => $record?->is_active ? 'tenant' : 'none',
        ]);
    }

    public function updateAppSettings(Request $request)
    {
        $this->ensureMetaSettingsAccess($request->user());
        $tenantId = $request->user()->tenant_id;
        $payload = $request->validate([
            'app_id' => 'required|string|max:255',
            'app_secret' => 'nullable|string|max:2048',
            'verify_token' => 'nullable|string|max:1024',
            'is_active' => 'sometimes|boolean',
        ]);

        $existing = TenantMetaApp::where('tenant_id', $tenantId)->first();
        if (!$existing) {
            $existing = new TenantMetaApp();
            $existing->tenant_id = $tenantId;
            $existing->webhook_key = $this->credentialsResolver->generateWebhookKey();
        }

        $existing->app_id = $payload['app_id'];
        if (!empty($payload['app_secret'])) {
            $existing->app_secret = $payload['app_secret'];
        }
        if (!empty($payload['verify_token'])) {
            $existing->verify_token = $payload['verify_token'];
        } elseif (!$existing->verify_token) {
            $existing->verify_token = Str::random(40);
        }
        if (array_key_exists('is_active', $payload)) {
            $existing->is_active = (bool) $payload['is_active'];
        }
        $existing->save();

        return response()->json([
            'message' => 'Tenant Meta app settings saved.',
        ]);
    }

    protected function ensureMetaSettingsAccess(User $user): void
    {
        if ($user->is_super_admin) {
            return;
        }

        if ($user->hasRole('Admin') || $user->hasRole('Tenant Admin')) {
            return;
        }

        abort(403, 'Only tenant admins can manage Meta App settings.');
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
            $asset = MetaAdAccount::where('tenant_id', $tenantId)->findOrFail($request->id);
            $asset->update(['is_active' => $request->is_active]);
        } else {
            $asset = MetaPage::where('tenant_id', $tenantId)->findOrFail($request->id);
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

        $page = MetaPage::where('tenant_id', $tenantId)->findOrFail($request->page_id);
        
        if ($request->ad_account_id) {
            // Verify ad account belongs to tenant
            $adAccount = MetaAdAccount::where('tenant_id', $tenantId)->findOrFail($request->ad_account_id);
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
            $asset = MetaBusiness::where('tenant_id', $tenantId)->findOrFail($request->id);
            // Optional: Check if it has ad accounts and warn? Or cascade delete?
            // Laravel relationships usually handle cascade if configured, otherwise we manual delete.
            // For now, let's just delete the business record. Ad Accounts might become orphaned or we should delete them too.
            // Ideally, we should delete children.
            MetaAdAccount::where('business_id', $asset->id)->delete();
            $asset->delete();
        } elseif ($request->type === 'ad_account') {
            $asset = MetaAdAccount::where('tenant_id', $tenantId)->findOrFail($request->id);
            $asset->delete();
        } elseif ($request->type === 'page') {
            $asset = MetaPage::where('tenant_id', $tenantId)->findOrFail($request->id);
            $asset->delete();
        }

        return response()->json(['message' => 'Asset deleted successfully']);
    }

    public function disconnect(Request $request)
    {
        $user = $request->user();
        $connectionId = $request->input('connection_id');

        if ($connectionId) {
            MetaConnection::where('tenant_id', $user->tenant_id)->where('id', $connectionId)->delete();
        } else {
            // Disconnect all if no specific ID
            MetaConnection::where('tenant_id', $user->tenant_id)->delete();
        }

        // Check if any connections remain
        $remainingConnections = MetaConnection::where('tenant_id', $user->tenant_id)->exists();

        if (!$remainingConnections) {
            MetaPage::where('tenant_id', $user->tenant_id)->delete();
            MetaAdAccount::where('tenant_id', $user->tenant_id)->delete();
            MetaBusiness::where('tenant_id', $user->tenant_id)->delete();
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
