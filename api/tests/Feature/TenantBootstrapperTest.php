<?php

namespace Tests\Feature;

use App\Http\Controllers\AuthController;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantBootstrapper;
use App\Services\TenantService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TenantBootstrapperTest extends TestCase
{
    use RefreshDatabase;

    public function test_bootstrap_assigns_tenant_admin_role_to_first_user(): void
    {
        $tenant = Tenant::factory()->create([
            'slug' => 'bootstrap-role',
            'status' => 'active',
        ]);

        $admin = app(TenantBootstrapper::class)->bootstrap($tenant, [
            'name' => 'Tenant Owner',
            'email' => 'owner@bootstrap-role.test',
            'password' => 'password123',
        ]);

        $this->assertNotNull($admin);

        setPermissionsTeamId($tenant->id);
        $admin->refresh();

        $this->assertTrue($admin->hasRole('Tenant Admin'));
        $this->assertSame('Tenant Admin', $admin->job_title);
        $this->assertSame('Tenant Admin', $admin->role);
        $this->assertContains('addLead', data_get($admin->meta_data, 'module_permissions.Leads', []));
    }

    public function test_ensure_tenant_admin_role_repairs_missing_assignment(): void
    {
        $tenant = Tenant::factory()->create([
            'slug' => 'repair-role',
            'status' => 'active',
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => 'owner@repair-role.test',
        ]);

        app(TenantBootstrapper::class)->ensureTenantAdminRole($admin, $tenant);

        setPermissionsTeamId($tenant->id);
        $admin->refresh();

        $this->assertTrue($admin->hasRole('Tenant Admin'));
        $this->assertSame('Tenant Admin', $admin->job_title);
    }

    public function test_create_tenant_service_returns_admin_with_tenant_admin_role(): void
    {
        $result = app(TenantService::class)->createTenant([
            'slug' => 'service-role',
            'company_name' => 'Service Role Corp',
            'admin_name' => 'Service Admin',
            'admin_email' => 'admin@service-role.test',
            'admin_password' => 'password123',
            'plan' => 'enterprise',
            'company_type' => 'General',
        ]);

        $tenant = $result['tenant'];
        $admin = $result['user'];

        setPermissionsTeamId($tenant->id);
        $admin->refresh();

        $this->assertTrue($admin->hasRole('Tenant Admin'));
        $this->assertSame('Tenant Admin', $admin->role);
    }

    public function test_serialize_auth_user_returns_tenant_admin_for_primary_admin(): void
    {
        $tenant = Tenant::factory()->create([
            'slug' => 'serialize-role',
            'status' => 'active',
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => 'owner@serialize-role.test',
        ]);

        app()->instance('tenant', $tenant);
        setPermissionsTeamId($tenant->id);

        app(TenantBootstrapper::class)->ensureTenantAdminRole($admin, $tenant);

        $controller = app(AuthController::class);
        $method = new \ReflectionMethod(AuthController::class, 'serializeAuthUser');
        $method->setAccessible(true);

        /** @var array $payload */
        $payload = $method->invoke($controller, $admin->fresh());

        $this->assertSame('Tenant Admin', $payload['role']);
        $this->assertTrue($payload['is_primary_admin']);
        $this->assertNotEmpty($payload['roles']);
        $this->assertContains('addLead', $payload['meta_data']['module_permissions']['Leads'] ?? []);
    }

    public function test_serialize_auth_user_expands_empty_admin_permissions(): void
    {
        $tenant = Tenant::factory()->create([
            'slug' => 'serialize-empty-perms',
            'status' => 'active',
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => 'owner@serialize-empty-perms.test',
            'job_title' => 'Tenant Admin',
            'meta_data' => [],
        ]);

        app()->instance('tenant', $tenant);
        setPermissionsTeamId($tenant->id);
        app(TenantBootstrapper::class)->ensureTenantRolesExist($tenant);
        $admin->assignRole('Tenant Admin');
        $admin->forceFill(['meta_data' => []])->save();

        $controller = app(AuthController::class);
        $method = new \ReflectionMethod(AuthController::class, 'serializeAuthUser');
        $method->setAccessible(true);

        /** @var array $payload */
        $payload = $method->invoke($controller, $admin->fresh());

        $this->assertContains('addLead', $payload['meta_data']['module_permissions']['Leads'] ?? []);
        $this->assertContains('importLeads', $payload['meta_data']['module_permissions']['Leads'] ?? []);
        $this->assertSame([], $admin->fresh()->meta_data ?? []);
    }

    public function test_serialize_auth_user_does_not_expand_sales_person_permissions(): void
    {
        $tenant = Tenant::factory()->create([
            'slug' => 'serialize-sales-perms',
            'status' => 'active',
        ]);

        User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => 'first@serialize-sales-perms.test',
            'job_title' => 'Tenant Admin',
        ]);

        $sales = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => 'sales@serialize-sales-perms.test',
            'job_title' => 'Sales Person',
            'meta_data' => [
                'module_permissions' => [
                    'Leads' => ['addAction'],
                ],
            ],
        ]);

        app()->instance('tenant', $tenant);
        setPermissionsTeamId($tenant->id);

        $controller = app(AuthController::class);
        $method = new \ReflectionMethod(AuthController::class, 'serializeAuthUser');
        $method->setAccessible(true);

        /** @var array $payload */
        $payload = $method->invoke($controller, $sales->fresh());

        $this->assertSame(['addAction'], $payload['meta_data']['module_permissions']['Leads'] ?? []);
    }

    public function test_bootstrap_persists_add_lead_permission_for_tenant_admin(): void
    {
        $tenant = Tenant::factory()->create([
            'slug' => 'bootstrap-add-lead',
            'status' => 'active',
        ]);

        $admin = app(TenantBootstrapper::class)->bootstrap($tenant, [
            'name' => 'Tenant Owner',
            'email' => 'owner@bootstrap-add-lead.test',
            'password' => 'password123',
        ]);

        $leadPerms = data_get($admin->fresh()->meta_data, 'module_permissions.Leads', []);
        $this->assertContains('addLead', $leadPerms);
    }
}
