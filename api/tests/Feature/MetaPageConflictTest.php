<?php

namespace Tests\Feature;

use App\Models\MetaConnection;
use App\Models\MetaPage;
use App\Models\Tenant;
use App\Services\MetaAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MetaPageConflictTest extends TestCase
{
    use RefreshDatabase;

    public function test_sync_assets_skips_page_already_linked_to_another_tenant(): void
    {
        config(['services.meta.mock_mode' => true]);

        $tenantA = Tenant::create([
            'id' => 'tenant_a',
            'name' => 'Tenant A',
            'slug' => 'tenant-a',
            'status' => 'active',
        ]);

        $tenantB = Tenant::create([
            'id' => 'tenant_b',
            'name' => 'Tenant B',
            'slug' => 'tenant-b',
            'status' => 'active',
        ]);

        $connectionA = MetaConnection::create([
            'tenant_id' => $tenantA->id,
            'fb_user_id' => 'fb-a',
            'user_access_token' => 'token-a',
        ]);

        MetaPage::create([
            'tenant_id' => $tenantA->id,
            'connection_id' => $connectionA->id,
            'page_id' => 'mock_page_1',
            'page_name' => 'Existing Page',
            'page_token' => 'page-token-a',
            'is_active' => true,
        ]);

        $connectionB = MetaConnection::create([
            'tenant_id' => $tenantB->id,
            'fb_user_id' => 'fb-b',
            'user_access_token' => 'token-b',
        ]);

        $service = app(MetaAuthService::class);
        $result = $service->syncAssets($connectionB);

        $this->assertDatabaseMissing('meta_pages', [
            'tenant_id' => $tenantB->id,
            'page_id' => 'mock_page_1',
        ]);

        $this->assertNotEmpty($result['sync_warnings']);
        $this->assertSame('page_conflict', $result['sync_warnings'][0]['type'] ?? null);
    }
}
