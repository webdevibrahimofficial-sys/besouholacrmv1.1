<?php

namespace Tests\Unit;

use App\Models\Tenant;
use App\Models\User;
use App\Services\AdminImpersonationService;
use App\Services\SystemAdminPermissionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class AdminImpersonationServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_current_for_support_token_returns_null_when_impersonation_table_is_missing(): void
    {
        Schema::shouldReceive('hasTable')->once()->with('admin_impersonation_sessions')->andReturn(false);

        $service = new AdminImpersonationService(app(SystemAdminPermissionService::class));
        $token = new PersonalAccessToken(['id' => 112]);

        $this->assertNull($service->currentForSupportToken($token));
    }

    public function test_start_throws_service_unavailable_when_impersonation_table_is_missing(): void
    {
        Schema::shouldReceive('hasTable')->once()->with('admin_impersonation_sessions')->andReturn(false);

        $service = new AdminImpersonationService(app(SystemAdminPermissionService::class));

        $this->expectException(HttpException::class);
        $this->expectExceptionMessage('Support access is unavailable until the impersonation storage migration is applied.');

        $service->start(new User(), new Tenant(), request(), []);
    }

    public function test_resolve_primary_tenant_user_returns_the_only_eligible_user(): void
    {
        $tenant = Tenant::factory()->create();
        $eligible = User::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'Active',
            'is_super_admin' => false,
        ]);

        $resolved = $this->service()->resolvePrimaryTenantUserForTest($tenant);

        $this->assertNotNull($resolved);
        $this->assertSame($eligible->id, $resolved->id);
    }

    public function test_resolve_primary_tenant_user_ignores_super_admins_and_inactive_users(): void
    {
        $tenant = Tenant::factory()->create();

        $superAdmin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'Active',
            'is_super_admin' => true,
        ]);

        User::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'Inactive',
            'is_super_admin' => false,
        ]);

        $eligible = User::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'Active',
            'is_super_admin' => false,
        ]);

        $resolved = $this->service()->resolvePrimaryTenantUserForTest($tenant);

        $this->assertNotNull($resolved);
        $this->assertSame($eligible->id, $resolved->id);
        $this->assertNotSame($superAdmin->id, $resolved->id);
    }

    public function test_resolve_primary_tenant_user_accepts_null_status_and_prefers_lowest_eligible_id(): void
    {
        $tenant = Tenant::factory()->create();

        $skippedInactive = User::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'Inactive',
            'is_super_admin' => false,
        ]);

        $firstEligible = User::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => null,
            'is_super_admin' => false,
        ]);

        User::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => null,
            'is_super_admin' => false,
        ]);

        $resolved = $this->service()->resolvePrimaryTenantUserForTest($tenant);

        $this->assertNotNull($resolved);
        $this->assertSame($firstEligible->id, $resolved->id);
        $this->assertNotSame($skippedInactive->id, $resolved->id);
    }

    public function test_resolve_primary_tenant_user_returns_null_when_no_eligible_user_exists(): void
    {
        $tenant = Tenant::factory()->create();

        User::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'Inactive',
            'is_super_admin' => false,
        ]);

        User::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'Inactive',
            'is_super_admin' => true,
        ]);

        $resolved = $this->service()->resolvePrimaryTenantUserForTest($tenant);

        $this->assertNull($resolved);
    }

    protected function service(): AdminImpersonationServiceTestProxy
    {
        return new AdminImpersonationServiceTestProxy(app(SystemAdminPermissionService::class));
    }
}

class AdminImpersonationServiceTestProxy extends AdminImpersonationService
{
    public function __construct(SystemAdminPermissionService $systemAdminPermissions)
    {
        parent::__construct($systemAdminPermissions);
    }

    public function resolvePrimaryTenantUserForTest(Tenant $tenant): ?User
    {
        return $this->resolvePrimaryTenantUser($tenant);
    }
}
