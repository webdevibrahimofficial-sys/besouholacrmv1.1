<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\User;
use Spatie\Permission\Models\Role;
use Illuminate\Support\Facades\Hash;

class TenantBootstrapper
{
    protected const DEFAULT_ROLES = ['Tenant Admin', 'Manager', 'Employee', 'Viewer', 'Accountant'];

    public function bootstrap(Tenant $tenant, ?array $adminData = null)
    {
        return $tenant->execute(function () use ($tenant, $adminData) {
            $this->ensureTenantRolesExist($tenant);

            $admin = null;

            if ($adminData) {
                $admin = User::create([
                    'name' => $adminData['name'],
                    'email' => $adminData['email'],
                    'password' => Hash::make($adminData['password']),
                    'tenant_id' => $tenant->id,
                ]);

                $this->ensureTenantAdminRole($admin, $tenant);
            }

            return $admin;
        });
    }

    public function ensureTenantRolesExist(Tenant $tenant): void
    {
        setPermissionsTeamId($tenant->id);

        $teamFk = config('permission.column_names.team_foreign_key', 'tenant_id');

        foreach (self::DEFAULT_ROLES as $roleName) {
            Role::firstOrCreate([
                'name' => $roleName,
                'guard_name' => 'web',
                $teamFk => $tenant->id,
            ]);
        }
    }

    public function ensureTenantAdminRole(User $user, Tenant $tenant): void
    {
        setPermissionsTeamId($tenant->id);
        $this->ensureTenantRolesExist($tenant);

        $user->unsetRelation('roles');

        if (!$user->hasRole('Tenant Admin')) {
            $user->assignRole('Tenant Admin');
        }

        if (empty($user->job_title)) {
            $user->forceFill(['job_title' => 'Tenant Admin'])->save();
        }

        $user->unsetRelation('roles');
    }
}
