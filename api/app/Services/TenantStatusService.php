<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\User;

class TenantStatusService
{
    public function __construct(
        private readonly AdminEventNotificationService $adminEventNotifications
    ) {
    }

    public function syncExpiredTenants(): int
    {
        $this->notifyExpiringSoonTenants();

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

    protected function notifyExpiringSoonTenants(): void
    {
        $days = max(1, (int) config('admin_notifications.tenant_expiring_soon_days', 7));

        Tenant::query()
            ->whereNull('archived_at')
            ->where('status', 'active')
            ->whereNotNull('end_date')
            ->whereBetween('end_date', [now()->toDateString(), now()->copy()->addDays($days)->toDateString()])
            ->get()
            ->each(function (Tenant $tenant) {
                $daysLeft = max(0, now()->startOfDay()->diffInDays($tenant->end_date->copy()->startOfDay(), false));
                $this->adminEventNotifications->safe(fn () => $this->adminEventNotifications->notifyTenantExpiringSoon($tenant, $daysLeft));
            });
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
