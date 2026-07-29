<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantAdminResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class TenantAdminResolverTest extends TestCase
{
    use RefreshDatabase;

    public function test_resolver_finds_tenant_admin_with_spatie_team_context(): void
    {
        $tenant = Tenant::create([
            'id' => 'tenant_admin_resolver',
            'name' => 'Resolver Tenant',
            'slug' => 'resolver-tenant',
            'status' => 'active',
        ]);

        setPermissionsTeamId($tenant->id);

        $role = Role::create([
            'name' => 'Tenant Admin',
            'guard_name' => 'web',
            'tenant_id' => $tenant->id,
        ]);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole($role);

        $regular = User::factory()->create(['tenant_id' => $tenant->id]);

        setPermissionsTeamId(null);

        $resolved = app(TenantAdminResolver::class)->resolveForTenant($tenant->id);

        $this->assertTrue($resolved->contains(fn (User $user) => $user->id === $admin->id));
        $this->assertFalse($resolved->contains(fn (User $user) => $user->id === $regular->id));
    }
}
