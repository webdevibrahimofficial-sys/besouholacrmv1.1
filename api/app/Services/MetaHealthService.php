<?php

namespace App\Services;

use App\Models\Integration;
use App\Models\Lead;
use App\Models\MetaConnection;
use App\Models\MetaPage;
use Illuminate\Support\Facades\DB;

class MetaHealthService
{
    public function __construct(
        protected MetaSystemSettingsService $metaSystemSettings,
        protected MetaRateLimitTracker $rateLimitTracker
    ) {
    }

    public function getGlobalHealth(): array
    {
        $pageConflicts = MetaPage::withoutGlobalScopes()
            ->select('page_id', DB::raw('COUNT(DISTINCT tenant_id) as tenant_count'))
            ->where('is_active', true)
            ->groupBy('page_id')
            ->having('tenant_count', '>', 1)
            ->count();

        return [
            'shared_app_configured' => $this->metaSystemSettings->isConfigured(),
            'connected_tenants' => MetaConnection::withoutGlobalScopes()->distinct()->count('tenant_id'),
            'active_pages' => MetaPage::withoutGlobalScopes()->where('is_active', true)->count(),
            'connections_needing_reauth' => MetaConnection::withoutGlobalScopes()->where('needs_reauth', true)->count(),
            'last_lead_at' => Lead::withoutGlobalScopes()
                ->where('source', 'Meta Ads')
                ->max('created_at'),
            'page_conflicts' => $pageConflicts,
            'rate_limit_events_24h' => $this->rateLimitTracker->countLast24Hours(),
            'rate_limit_recent' => $this->rateLimitTracker->recentEvents(20),
        ];
    }

    public function getTenantHealth(int|string $tenantId): array
    {
        $integration = Integration::where('tenant_id', $tenantId)->where('provider', 'meta')->first();
        $settings = is_array($integration?->settings) ? $integration->settings : [];

        $activePages = MetaPage::where('tenant_id', $tenantId)->where('is_active', true)->count();
        $subscribeSummary = is_array($settings['subscribe_summary'] ?? null) ? $settings['subscribe_summary'] : [];

        return [
            'shared_meta_configured' => $this->metaSystemSettings->isConfigured(),
            'connections_needing_reauth' => MetaConnection::where('tenant_id', $tenantId)->where('needs_reauth', true)->count(),
            'active_pages' => $activePages,
            'sync_warnings' => is_array($settings['sync_warnings'] ?? null) ? $settings['sync_warnings'] : [],
            'subscribe_summary' => $subscribeSummary,
            'last_lead_at' => Lead::where('tenant_id', $tenantId)->where('source', 'Meta Ads')->max('created_at'),
        ];
    }

    /**
     * Summarize whether the tenant's Meta integration needs user action.
     *
     * @return array{needs_attention: bool, reasons: array<int, string>, primary_reason: ?string, label: ?string}
     */
    public function getTenantAttention(int|string $tenantId): array
    {
        $hasConnection = MetaConnection::where('tenant_id', $tenantId)->exists();
        if (! $hasConnection) {
            return [
                'needs_attention' => false,
                'reasons' => [],
                'primary_reason' => null,
                'label' => null,
            ];
        }

        $health = $this->getTenantHealth($tenantId);
        $reasons = [];

        if (($health['connections_needing_reauth'] ?? 0) > 0) {
            $reasons[] = 'reauth_required';
        }

        $hasExpiredToken = MetaConnection::where('tenant_id', $tenantId)
            ->where('needs_reauth', false)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->exists();

        if ($hasExpiredToken) {
            $reasons[] = 'token_expired';
        }

        if (($health['active_pages'] ?? 0) === 0) {
            $reasons[] = 'no_active_pages';
        }

        if ((int) ($health['subscribe_summary']['failed'] ?? 0) > 0) {
            $reasons[] = 'webhook_subscribe_failed';
        }

        if (! empty($health['sync_warnings'])) {
            $reasons[] = 'sync_warnings';
        }

        $reasons = array_values(array_unique($reasons));
        $primaryReason = $reasons[0] ?? null;

        $labels = [
            'reauth_required' => 'Reconnection required',
            'token_expired' => 'Token expired',
            'no_active_pages' => 'No active pages',
            'webhook_subscribe_failed' => 'Webhook subscription failed',
            'sync_warnings' => 'Sync warnings',
        ];

        return [
            'needs_attention' => ! empty($reasons),
            'reasons' => $reasons,
            'primary_reason' => $primaryReason,
            'label' => $primaryReason ? ($labels[$primaryReason] ?? 'Needs attention') : null,
        ];
    }

    /**
     * Production go-live checklist for tenant Meta integration.
     *
     * @return array{ready: bool, completed: int, total: int, items: array<int, array<string, mixed>>}
     */
    public function getTenantGoLiveChecklist(int|string $tenantId): array
    {
        $health = $this->getTenantHealth($tenantId);
        $attention = $this->getTenantAttention($tenantId);
        $hasConnection = MetaConnection::where('tenant_id', $tenantId)->exists();
        $integration = Integration::where('tenant_id', $tenantId)->where('provider', 'meta')->first();
        $settings = is_array($integration?->settings) ? $integration->settings : [];
        $hasFormMapping = ! empty($settings['formMap'] ?? []);
        $subscribed = (int) ($health['subscribe_summary']['subscribed'] ?? 0);

        $items = [
            [
                'id' => 'shared_app',
                'group' => 'platform',
                'automated' => true,
                'complete' => (bool) ($health['shared_meta_configured'] ?? false),
            ],
            [
                'id' => 'meta_connected',
                'group' => 'tenant',
                'automated' => true,
                'complete' => $hasConnection,
            ],
            [
                'id' => 'active_pages',
                'group' => 'tenant',
                'automated' => true,
                'complete' => ($health['active_pages'] ?? 0) > 0,
            ],
            [
                'id' => 'webhook_subscribed',
                'group' => 'tenant',
                'automated' => true,
                'complete' => $subscribed > 0,
            ],
            [
                'id' => 'auto_sync_enabled',
                'group' => 'tenant',
                'automated' => true,
                'complete' => ($settings['autoSync'] ?? true) !== false,
            ],
            [
                'id' => 'field_mapping',
                'group' => 'tenant',
                'automated' => true,
                'complete' => $hasFormMapping || ! $hasConnection,
            ],
            [
                'id' => 'no_attention_flags',
                'group' => 'tenant',
                'automated' => true,
                'complete' => ! ($attention['needs_attention'] ?? false),
            ],
            [
                'id' => 'first_lead_received',
                'group' => 'tenant',
                'automated' => true,
                'complete' => ! empty($health['last_lead_at']),
            ],
            [
                'id' => 'meta_console_webhook',
                'group' => 'platform',
                'automated' => false,
                'complete' => false,
            ],
            [
                'id' => 'queue_worker_meta',
                'group' => 'platform',
                'automated' => false,
                'complete' => false,
            ],
            [
                'id' => 'token_refresh_cron',
                'group' => 'platform',
                'automated' => false,
                'complete' => false,
            ],
        ];

        $completed = collect($items)->where('complete', true)->count();
        $automatedItems = collect($items)->where('automated', true);
        $automatedComplete = $automatedItems->where('complete', true)->count();

        return [
            'ready' => $hasConnection
                && ($health['active_pages'] ?? 0) > 0
                && $subscribed > 0
                && ! ($attention['needs_attention'] ?? false)
                && $automatedComplete === $automatedItems->count(),
            'completed' => $completed,
            'total' => count($items),
            'items' => $items,
        ];
    }
}
