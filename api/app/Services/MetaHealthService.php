<?php

namespace App\Services;

use App\Models\Integration;
use App\Models\Lead;
use App\Models\MetaConnection;
use App\Models\MetaPage;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class MetaHealthService
{
    public function __construct(protected MetaSystemSettingsService $metaSystemSettings)
    {
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
            'rate_limit_events_24h' => (int) Cache::get('meta:rate_limit_events_24h', 0),
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
}
