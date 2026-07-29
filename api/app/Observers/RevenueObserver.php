<?php

namespace App\Observers;

use App\Models\Lead;
use App\Models\Revenue;
use App\Services\MetaCapiService;
use Illuminate\Support\Facades\Log;

class RevenueObserver
{
    public function created(Revenue $revenue): void
    {
        if (! $revenue->lead_id) {
            return;
        }

        $lead = Lead::find($revenue->lead_id);
        if (! $lead) {
            return;
        }

        $tenantId = $revenue->tenant_id ?: $lead->tenant_id;
        if (! $tenantId) {
            return;
        }

        try {
            app(MetaCapiService::class)->sendPurchaseEventIfEnabled($tenantId, $lead, $revenue);
        } catch (\Throwable $e) {
            Log::warning('Meta CAPI Purchase observer dispatch failed.', [
                'tenant_id' => $tenantId,
                'lead_id' => $lead->id,
                'revenue_id' => $revenue->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
