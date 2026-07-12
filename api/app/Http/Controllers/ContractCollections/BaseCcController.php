<?php

namespace App\Http\Controllers\ContractCollections;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

abstract class BaseCcController extends Controller
{
    protected function tenantId(Request $request): int
    {
        return (int) ($request->user()?->tenant_id ?? 0);
    }

    protected function isTenantAdmin(User $user): bool
    {
        $roleRaw = (string) ($user->role ?? $user->job_title ?? '');
        $roleLower = strtolower(trim($roleRaw));

        return $user->is_super_admin
            || in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'owner'], true)
            || str_contains($roleLower, 'super admin')
            || str_contains($roleLower, 'superadmin');
    }

    protected function requireCcPermission(Request $request, string $action): void
    {
        $user = $request->user();
        if (!$user) {
            abort(401);
        }
        if ($this->isTenantAdmin($user)) {
            return;
        }

        $perms = $this->resolveCcPermissions($user);
        if (!in_array($action, $perms, true)) {
            abort(403, 'Unauthorized');
        }
    }

    protected function resolveCcPermissions(User $user): array
    {
        if ($this->isTenantAdmin($user)) {
            return ['showModule', 'viewContracts', 'viewInstallments', 'payInstallment', 'printReceipt', 'exportReports'];
        }

        if ($this->isSalesPerson($user) || $this->isTeamLeader($user)) {
            return [];
        }

        $meta = is_array($user->meta_data) ? $user->meta_data : [];
        $modulePerms = is_array($meta['module_permissions'] ?? null) ? $meta['module_permissions'] : [];

        $ccPerms = is_array($modulePerms['ContractCollections'] ?? null) ? $modulePerms['ContractCollections'] : [];
        if ($ccPerms !== []) {
            return array_values(array_unique($ccPerms));
        }

        // Legacy users may only have Customers module permissions saved.
        $customerPerms = is_array($modulePerms['Customers'] ?? null) ? $modulePerms['Customers'] : [];
        if (in_array('showModule', $customerPerms, true)) {
            return ['showModule', 'viewContracts', 'viewInstallments'];
        }

        return $this->defaultCcPermissionsForRole($user);
    }

    protected function defaultCcPermissionsForRole(User $user): array
    {
        $roleLower = strtolower(trim(preg_replace('/[\s_-]+/', ' ', (string) ($user->role ?? $user->job_title ?? ''))));

        if (str_contains($roleLower, 'accountant')) {
            return ['showModule', 'viewContracts', 'viewInstallments', 'payInstallment', 'printReceipt'];
        }

        $readRoles = [
            'sales admin',
            'operation manager',
            'branch manager',
            'director',
            'sales manager',
            'customer manager',
            'customer team leader',
            'customer agent',
        ];

        foreach ($readRoles as $role) {
            if (str_contains($roleLower, $role)) {
                return ['showModule', 'viewContracts', 'viewInstallments'];
            }
        }

        return [];
    }

    protected function isSalesPerson(User $user): bool
    {
        $roleLower = strtolower(trim(preg_replace('/[\s_-]+/', ' ', (string) ($user->role ?? $user->job_title ?? ''))));

        return str_contains($roleLower, 'sales person') || str_contains($roleLower, 'salesperson');
    }

    protected function isTeamLeader(User $user): bool
    {
        $roleLower = strtolower(trim(preg_replace('/[\s_-]+/', ' ', (string) ($user->role ?? $user->job_title ?? ''))));

        return str_contains($roleLower, 'team leader') || str_contains($roleLower, 'teamleader');
    }
}

