<?php

namespace Tests\Feature;

use App\Jobs\SyncMetaAssets;
use App\Models\MetaConnection;
use App\Models\Tenant;
use App\Services\MetaAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class SyncMetaAssetsJobTest extends TestCase
{
    use RefreshDatabase;

    public function test_job_binds_current_tenant_before_syncing_assets(): void
    {
        $tenant = Tenant::create([
            'id' => 'tenant_sync_assets',
            'name' => 'Tenant Sync Assets',
            'slug' => 'tenant-sync-assets',
            'status' => 'active',
        ]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'token-1',
            'name' => 'Test User',
            'email' => 'test@example.com',
        ]);

        $service = Mockery::mock(MetaAuthService::class);
        $service->shouldReceive('syncAssets')
            ->once()
            ->with(Mockery::on(function (MetaConnection $model) use ($connection, $tenant) {
                return $model->is($connection)
                    && (string) app('current_tenant_id') === (string) $tenant->id;
            }));

        $job = new SyncMetaAssets($tenant->id, $connection->id);
        $job->handle($service);
    }
}
