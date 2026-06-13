<?php

namespace App\Jobs;

use App\Services\MetaCampaignService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Spatie\Multitenancy\Jobs\NotTenantAware;

class SyncMetaCampaigns implements ShouldQueue, NotTenantAware
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $tenantId;

    /**
     * Create a new job instance.
     */
    public function __construct($tenantId)
    {
        $this->tenantId = $tenantId;
        $this->onConnection(config('queue.meta_connection', 'redis'));
        $this->onQueue('meta');
    }

    /**
     * Execute the job.
     */
    public function handle(MetaCampaignService $service): void
    {
        app()->instance('current_tenant_id', $this->tenantId);
        $service->syncAll($this->tenantId);
    }
}
