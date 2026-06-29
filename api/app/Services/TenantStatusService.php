<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\User;

class TenantStatusService
{
    public function syncExpiredTenants(): int
    {
        $expiredTenants = Tenant::query()
            ->whereNull('archived_at')
            ->whereNotNull('end_date')
            ->whereDate('end_date', '<', now()->toDateString())
            ->whereNotIn('status', ['expired', 'cancelled', 'suspended'])
            ->get();

        $updated = 0;

        foreach ($expiredTenants as $tenant) {
            $tenant->status = 'expired';
            $tenant->save();
            $this->revokeTenantUserTokens($tenant);
            $updated++;
        }

        return $updated;
    }

    public function revokeTenantUserTokens(Tenant $tenant): void
    {
        User::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenant->id)
            ->where('is_super_admin', false)
            ->get()
            ->each(function (User $user) {
                try {
                    $user->tokens()->delete();
                } catch (\Throwable $e) {
                }
            });
    }
}
