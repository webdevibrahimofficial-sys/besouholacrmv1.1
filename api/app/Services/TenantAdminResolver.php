<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Resolves tenant administrators for notifications and alerts.
 *
 * Spatie permission roles are scoped per tenant team; callers must use this
 * helper instead of raw whereHas('roles') queries.
 */
class TenantAdminResolver
{
    /**
     * @return Collection<int, User>
     */
    public function resolveForTenant(int|string $tenantId): Collection
    {
        $tenantId = (string) $tenantId;
        $previousTeamId = function_exists('getPermissionsTeamId') ? getPermissionsTeamId() : null;

        try {
            if (function_exists('setPermissionsTeamId')) {
                setPermissionsTeamId($tenantId);
            }

            $admins = User::where('tenant_id', $tenantId)
                ->whereHas('roles', function ($query) {
                    $query->whereIn('name', ['Tenant Admin', 'Admin']);
                })
                ->get();

            if ($admins->isNotEmpty()) {
                return $admins;
            }
        } finally {
            if (function_exists('setPermissionsTeamId')) {
                setPermissionsTeamId($previousTeamId);
            }
        }

        return User::where('tenant_id', $tenantId)->limit(1)->get();
    }
}
