<?php

namespace App\Services;

use App\Models\LandlordUser;
use App\Models\Tenant;
use App\Models\User;
use App\Models\CrmSetting;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class TenantBootstrapper
{
    protected const DEFAULT_ROLES = ['Tenant Admin', 'Manager', 'Employee', 'Viewer', 'Accountant'];

    public function bootstrap(Tenant $tenant, ?array $adminData = null)
    {
        return $tenant->execute(function () use ($tenant, $adminData) {
            $this->ensureTenantRolesExist($tenant);
            $this->ensureCrmSettingsExist($tenant);

            $admin = null;

            if ($adminData) {
                $admin = User::create([
                    'name' => $adminData['name'],
                    'email' => $adminData['email'],
                    'password' => Hash::make($adminData['password']),
                    'tenant_id' => $tenant->id,
                ]);

                $this->ensureTenantAdminRole($admin, $tenant);
                $this->syncAdminToLandlord($admin, $tenant);
            }

            return $admin;
        });
    }

    public function ensureTenantRolesExist(Tenant $tenant): void
    {
        setPermissionsTeamId($tenant->id);

        $connection = $this->workspaceConnectionName($tenant);
        $teamFk = config('permission.column_names.team_foreign_key', 'tenant_id');
        $timestamp = now();

        foreach (self::DEFAULT_ROLES as $roleName) {
            DB::connection($connection)->table('roles')->updateOrInsert(
                [
                    'name' => $roleName,
                    'guard_name' => 'web',
                    $teamFk => $tenant->id,
                ],
                [
                    'updated_at' => $timestamp,
                    'created_at' => $timestamp,
                ]
            );
        }
    }

    public function ensureCrmSettingsExist(Tenant $tenant): void
    {
        try {
            if (! Schema::hasTable('crm_settings')) {
                return;
            }
            CrmSetting::ensureInitialized((int) $tenant->id);
        } catch (\Throwable) {
            // Bootstrap must not fail tenant creation if settings table is not ready yet.
        }
    }

    public function ensureTenantAdminRole(User $user, Tenant $tenant): void
    {
        setPermissionsTeamId($tenant->id);
        $this->ensureTenantRolesExist($tenant);
        $connection = $this->workspaceConnectionName($tenant);
        $teamFk = config('permission.column_names.team_foreign_key', 'tenant_id');

        $user->unsetRelation('roles');

        $roleId = DB::connection($connection)->table('roles')
            ->where('name', 'Tenant Admin')
            ->where('guard_name', 'web')
            ->where($teamFk, $tenant->id)
            ->value('id');

        if ($roleId) {
            DB::connection($connection)->table('model_has_roles')->updateOrInsert(
                [
                    'role_id' => $roleId,
                    'model_type' => User::class,
                    'model_id' => $user->id,
                    $teamFk => $tenant->id,
                ],
                []
            );
        }

        if (empty($user->job_title)) {
            $user->forceFill(['job_title' => 'Tenant Admin'])->save();
        }

        $user->unsetRelation('roles');
    }

    protected function workspaceConnectionName(Tenant $tenant): string
    {
        if ($tenant->tenancy_type === 'dedicated') {
            return config('multitenancy.tenant_database_connection_name', 'tenant-dedicated');
        }

        return config('database.default', 'mysql');
    }

    protected function syncAdminToLandlord(User $admin, Tenant $tenant): void
    {
        if ($tenant->tenancy_type !== 'dedicated') {
            return;
        }

        LandlordUser::withoutGlobalScopes()->updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'email' => $admin->email,
            ],
            [
                'name' => $admin->name,
                'password' => $admin->getAuthPassword(),
                'is_super_admin' => false,
                'status' => $admin->status ?: 'Active',
                'job_title' => $admin->job_title ?: 'Tenant Admin',
                'locale' => $admin->locale,
                'timezone' => $admin->timezone,
                'theme_mode' => $admin->theme_mode,
                'avatar' => $admin->avatar,
                'phone' => $admin->phone,
                'username' => $admin->username,
            ]
        );
    }
}
