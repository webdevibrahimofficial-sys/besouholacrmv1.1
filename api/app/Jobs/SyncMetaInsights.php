<?php

namespace App\Jobs;

use App\Services\MetaInsightService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Spatie\Multitenancy\Jobs\NotTenantAware;

class SyncMetaInsights implements ShouldQueue, NotTenantAware
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tenantId;
    public $days;

    /**
     * Create a new job instance.
     */
    public function __construct($tenantId, $days = 3)
    {
        $this->tenantId = $tenantId;
        $this->days = $days;
    }

    /**
     * Execute the job.
     */
    public function handle(MetaInsightService $service): void
    {
        app()->instance('current_tenant_id', $this->tenantId);
        $service->syncInsights($this->tenantId, $this->days);
    }
}
