<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\User;
use Spatie\Permission\Models\Permission;
use Symfony\Component\HttpKernel\Exception\HttpException;

class SystemAdminPermissionService
{
    public const SYSTEM_TENANT_SLUG = 'owner';
    public const IMPERSONATE_PERMISSION = 'system.tenants.impersonate';

    public function resolveSystemTenant(): ?Tenant
    {
        return Tenant::query()->where('slug', self::SYSTEM_TENANT_SLUG)->first();
    }

    public function applyTeamContext(?User $user = null): void
    {
        if (!function_exists('setPermissionsTeamId')) {
            return;
        }

        $systemTenant = $this->resolveSystemTenant();
        $teamId = $systemTenant?->id ?? $user?->tenant_id;

        if ($teamId) {
            setPermissionsTeamId($teamId);
        }
    }

    public function userCanImpersonateTenants(User $user): bool
    {
        if (!$user->is_super_admin) {
            return false;
        }

        $this->applyTeamContext($user);

        if ($user->can(self::IMPERSONATE_PERMISSION)) {
            return true;
        }

        $override = data_get($user->meta_data, 'system_permissions_override');

        return is_array($override) && in_array(self::IMPERSONATE_PERMISSION, $override, true);
    }

    public function ensureCanImpersonateTenants(User $user): void
    {
        if (!$user->is_super_admin) {
            throw new HttpException(403, 'You are not allowed to start support access sessions.');
        }

        if ($this->userCanImpersonateTenants($user)) {
            return;
        }

        if ($this->bootstrapLegacySuperAdmin($user) && $this->userCanImpersonateTenants($user)) {
            return;
        }

        throw new HttpException(403, 'You are not allowed to start support access sessions.');
    }

    /**
     * Backfill impersonation permission for bootstrap super admins that only
     * have the legacy is_super_admin flag and no system RBAC assignment yet.
     */
    public function bootstrapLegacySuperAdmin(User $user): bool
    {
        if (!$user->is_super_admin) {
            return false;
        }

        $systemTenant = $this->resolveSystemTenant();
        if (!$systemTenant) {
            return false;
        }

        if ($user->tenant_id && (int) $user->tenant_id !== (int) $systemTenant->id) {
            return false;
        }

        $this->applyTeamContext($user);

        if ($user->roles()->where('roles.tenant_id', $systemTenant->id)->exists()) {
            return false;
        }

        Permission::findOrCreate(self::IMPERSONATE_PERMISSION, 'web');

        $user->givePermissionTo(self::IMPERSONATE_PERMISSION);

        if (!$user->tenant_id) {
            $user->forceFill(['tenant_id' => $systemTenant->id])->save();
        }

        return true;
    }
}
