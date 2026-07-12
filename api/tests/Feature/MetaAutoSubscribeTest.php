<?php

namespace Tests\Feature;

use App\Models\Integration;
use App\Models\MetaConnection;
use App\Models\MetaPage;
use App\Models\Tenant;
use App\Services\MetaAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MetaAutoSubscribeTest extends TestCase
{
    use RefreshDatabase;

    public function test_sync_assets_auto_subscribes_active_pages_in_mock_mode(): void
    {
        config(['services.meta.mock_mode' => true]);

        $tenant = Tenant::create([
            'id' => 'tenant_auto_sub',
            'name' => 'Tenant Auto Sub',
            'slug' => 'tenant-auto-sub',
            'status' => 'active',
        ]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-auto-sub',
            'user_access_token' => 'mock-token',
            'name' => 'Auto Sub User',
        ]);

        $service = app(MetaAuthService::class);
        $result = $service->syncAssets($connection);

        $this->assertGreaterThan(0, $result['subscribe_summary']['subscribed'] ?? 0);
        $this->assertSame(0, $result['subscribe_summary']['failed'] ?? -1);

        $integration = Integration::where('tenant_id', $tenant->id)->where('provider', 'meta')->first();
        $this->assertNotNull($integration);
        $this->assertGreaterThan(0, $integration->settings['subscribe_summary']['subscribed'] ?? 0);
    }
}
