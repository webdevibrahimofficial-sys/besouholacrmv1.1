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
        if (!$user) abort(401);
        if ($this->isTenantAdmin($user)) return;

        $meta = is_array($user->meta_data) ? $user->meta_data : [];
        $modulePerms = $meta['module_permissions'] ?? [];
        $modulePerms = is_array($modulePerms) ? $modulePerms : [];
        $ccPerms = $modulePerms['ContractCollections'] ?? [];
        $ccPerms = is_array($ccPerms) ? $ccPerms : [];

        if (!in_array($action, $ccPerms, true)) {
            abort(403, 'Unauthorized');
        }
    }
}

