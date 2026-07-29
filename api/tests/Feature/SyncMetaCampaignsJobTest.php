<?php

namespace Tests\Feature;

use App\Jobs\SyncMetaCampaigns;
use App\Services\MetaCampaignService;
use Mockery;
use Tests\TestCase;

class SyncMetaCampaignsJobTest extends TestCase
{
    public function test_job_binds_current_tenant_before_syncing_campaigns(): void
    {
        $service = Mockery::mock(MetaCampaignService::class);
        $service->shouldReceive('syncAll')
            ->once()
            ->with(Mockery::on(function ($tenantId) {
                return (string) $tenantId === '37'
                    && (string) app('current_tenant_id') === '37';
            }));

        $job = new SyncMetaCampaigns(37);
        $job->handle($service);
    }
}
