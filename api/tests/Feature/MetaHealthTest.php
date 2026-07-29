<?php

namespace Tests\Feature;

use App\Models\MetaConnection;
use App\Models\MetaPage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaHealthTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    public function test_super_admin_can_fetch_global_meta_health(): void
    {
        $this->seedSharedMetaApp();

        $systemTenant = Tenant::create([
            'id' => 'system',
            'name' => 'System',
            'slug' => 'system',
            'status' => 'active',
        ]);

        $tenant = Tenant::create([
            'id' => 'tenant_health',
            'name' => 'Tenant Health',
            'slug' => 'tenant-health',
            'status' => 'active',
        ]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-health',
            'user_access_token' => 'token',
        ]);

        MetaPage::create([
            'tenant_id' => $tenant->id,
            'connection_id' => $connection->id,
            'page_id' => 'page-health',
            'page_name' => 'Health Page',
            'page_token' => 'page-token',
            'is_active' => true,
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $systemTenant->id,
            'is_super_admin' => true,
        ]);

        $response = $this->actingAs($admin)->getJson('/api/super-admin/meta/health');

        $response->assertOk()
            ->assertJsonPath('shared_app_configured', true)
            ->assertJsonPath('connected_tenants', 1)
            ->assertJsonPath('active_pages', 1);
    }

    public function test_super_admin_can_verify_shared_webhook(): void
    {
        $this->seedSharedMetaApp('123456', 'shared-secret', 'verify-health');

        $systemTenant = Tenant::create([
            'id' => 'system',
            'name' => 'System',
            'slug' => 'system',
            'status' => 'active',
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $systemTenant->id,
            'is_super_admin' => true,
        ]);

        $response = $this->actingAs($admin)->postJson('/api/super-admin/meta/test-webhook');

        $response->assertOk()
            ->assertJsonPath('ok', true);
    }

    public function test_tenant_can_verify_shared_webhook(): void
    {
        $this->seedSharedMetaApp('123456', 'shared-secret', 'verify-tenant-health');

        $tenant = Tenant::create([
            'id' => 'tenant_webhook_test',
            'name' => 'Tenant Webhook Test',
            'slug' => 'tenant-webhook-test',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
        ]);

        $response = $this->actingAs($user)->postJson('/api/auth/meta/test-webhook');

        $response->assertOk()
            ->assertJsonPath('ok', true);
    }
}
