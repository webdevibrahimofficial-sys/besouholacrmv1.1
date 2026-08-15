<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\MetaConnection;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaAgencyScopeTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    protected function createTenantWithAgencies(): array
    {
        $tenant = Tenant::create([
            'id' => 'tenant_meta_agency_scope',
            'name' => 'Tenant Meta Agency Scope',
            'slug' => 'tenant-meta-agency-scope',
            'status' => 'active',
        ]);

        $agencyA = Agency::create([
            'tenant_id' => $tenant->id,
            'name' => 'Agency A',
            'key' => 'agency-a',
            'is_active' => true,
        ]);

        $agencyB = Agency::create([
            'tenant_id' => $tenant->id,
            'name' => 'Agency B',
            'key' => 'agency-b',
            'is_active' => true,
        ]);

        return compact('tenant', 'agencyA', 'agencyB');
    }

    public function test_admin_redirect_requires_agency_id(): void
    {
        $this->seedSharedMetaApp();
        ['tenant' => $tenant] = $this->createTenantWithAgencies();

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Tenant Admin',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/auth/meta/redirect');

        $response->assertStatus(422)->assertJson([
            'error' => 'agency_id is required to connect a Meta account.',
        ]);
    }

    public function test_admin_redirect_is_blocked_only_for_agency_that_already_has_connection(): void
    {
        $this->seedSharedMetaApp();
        ['tenant' => $tenant, 'agencyA' => $agencyA, 'agencyB' => $agencyB] = $this->createTenantWithAgencies();

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Tenant Admin',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agencyA->key,
            'fb_user_id' => 'fb-user-a',
            'user_access_token' => 'token-a',
        ]);

        $blocked = $this->actingAs($admin)->getJson('/api/auth/meta/redirect?agency_id=' . $agencyA->key);
        $blocked->assertStatus(409)->assertJson([
            'error' => 'This agency already has a connected Meta account. Disconnect it first before connecting another.',
        ]);

        config(['services.meta.mock_mode' => true]);

        $allowed = $this->actingAs($admin)->getJson('/api/auth/meta/redirect?agency_id=' . $agencyB->key);
        $allowed->assertOk()->assertJsonStructure(['url']);
    }

    public function test_agency_user_redirect_uses_locked_agency_without_request_param(): void
    {
        $this->seedSharedMetaApp();
        ['tenant' => $tenant, 'agencyA' => $agencyA] = $this->createTenantWithAgencies();

        $agencyUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agencyA->key,
            'job_title' => 'Marketing Manager',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agencyA->key,
            'fb_user_id' => 'fb-user-a',
            'user_access_token' => 'token-a',
        ]);

        $response = $this->actingAs($agencyUser)->getJson('/api/auth/meta/redirect');

        $response->assertStatus(409)->assertJson([
            'error' => 'This agency already has a connected Meta account. Disconnect it first before connecting another.',
        ]);
    }

    public function test_status_filters_connections_for_agency_user(): void
    {
        $this->seedSharedMetaApp();
        ['tenant' => $tenant, 'agencyA' => $agencyA, 'agencyB' => $agencyB] = $this->createTenantWithAgencies();

        $agencyUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agencyA->key,
            'job_title' => 'Sales Person',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agencyA->key,
            'fb_user_id' => 'fb-user-a',
            'user_access_token' => 'token-a',
            'name' => 'Agency A User',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agencyB->key,
            'fb_user_id' => 'fb-user-b',
            'user_access_token' => 'token-b',
            'name' => 'Agency B User',
        ]);

        $response = $this->actingAs($agencyUser)->getJson('/api/auth/meta/status');

        $response->assertOk()
            ->assertJsonPath('meta_agency.locked_agency_id', $agencyA->key)
            ->assertJsonCount(1, 'connections')
            ->assertJsonPath('connections.0.name', 'Agency A User');
    }

    public function test_admin_status_can_filter_by_agency_query_param(): void
    {
        $this->seedSharedMetaApp();
        ['tenant' => $tenant, 'agencyA' => $agencyA, 'agencyB' => $agencyB] = $this->createTenantWithAgencies();

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Tenant Admin',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agencyA->key,
            'fb_user_id' => 'fb-user-a',
            'user_access_token' => 'token-a',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agencyB->key,
            'fb_user_id' => 'fb-user-b',
            'user_access_token' => 'token-b',
        ]);

        $all = $this->actingAs($admin)->getJson('/api/auth/meta/status');
        $all->assertOk()
            ->assertJsonCount(2, 'connections')
            ->assertJsonPath('meta_agency.default_agency_id', null)
            ->assertJsonPath('meta_agency.filter', null);

        $filtered = $this->actingAs($admin)->getJson('/api/auth/meta/status?agency_id=' . $agencyB->key);
        $filtered->assertOk()
            ->assertJsonPath('meta_agency.filter', $agencyB->key)
            ->assertJsonCount(1, 'connections')
            ->assertJsonPath('connections.0.agency_id', $agencyB->key);
    }

    public function test_admin_status_auto_selects_sole_tenant_agency(): void
    {
        $this->seedSharedMetaApp();
        $tenant = Tenant::create([
            'id' => 'tenant_meta_sole_agency',
            'name' => 'Tenant Meta Sole Agency',
            'slug' => 'tenant-meta-sole-agency',
            'status' => 'active',
        ]);

        $agency = Agency::create([
            'tenant_id' => $tenant->id,
            'name' => 'Cashflow',
            'key' => 'cashflow',
            'is_active' => true,
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Tenant Admin',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->key,
            'fb_user_id' => 'fb-user-cashflow',
            'user_access_token' => 'token-cashflow',
            'name' => 'Cashflow Connection',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/auth/meta/status');

        $response->assertOk()
            ->assertJsonPath('meta_agency.default_agency_id', 'cashflow')
            ->assertJsonPath('meta_agency.filter', 'cashflow')
            ->assertJsonPath('meta_agency.can_manage_assets', true)
            ->assertJsonCount(1, 'connections');
    }

    public function test_admin_redirect_uses_sole_tenant_agency_without_request_param(): void
    {
        $this->seedSharedMetaApp();
        $tenant = Tenant::create([
            'id' => 'tenant_meta_sole_redirect',
            'name' => 'Tenant Meta Sole Redirect',
            'slug' => 'tenant-meta-sole-redirect',
            'status' => 'active',
        ]);

        Agency::create([
            'tenant_id' => $tenant->id,
            'name' => 'Cashflow',
            'key' => 'cashflow',
            'is_active' => true,
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Tenant Admin',
        ]);

        config(['services.meta.mock_mode' => true]);

        $response = $this->actingAs($admin)->getJson('/api/auth/meta/redirect');

        $response->assertOk()->assertJsonStructure(['url']);
    }
}
