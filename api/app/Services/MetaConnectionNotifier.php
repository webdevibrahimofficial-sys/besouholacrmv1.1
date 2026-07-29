<?php

namespace App\Services;

use App\Models\MetaConnection;
use App\Models\Tenant;
use App\Notifications\MetaTokenRefreshAttentionNotification;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Single source of truth for alerting humans about Meta connection problems.
 *
 * It guarantees the tenant that actually owns the connection is notified
 * (in-app + email via Laravel notifications), regardless of the super-admin
 * `admin_notifications_v1` feature flag, and additionally surfaces the issue
 * on the super-admin panel. A daily dedupe prevents spam because the token
 * refresh path can be hit hourly by campaign/insight sync.
 */
class MetaConnectionNotifier
{
    public function __construct(
        protected AdminEventNotificationService $adminEventNotifications,
        protected TenantAdminResolver $tenantAdmins
    ) {
    }

    /**
     * Alert about a Meta connection that could not be refreshed / is failing.
     */
    public function notifyTokenIssue(MetaConnection $connection, string $reason): void
    {
        $dedupeKey = 'meta_conn_issue:' . $connection->id . ':' . now()->toDateString();

        // Cache::add is atomic: only the first caller for this connection today
        // proceeds, so hourly sync retries won't spam the tenant with emails.
        if (! Cache::add($dedupeKey, 1, now()->addDay())) {
            return;
        }

        $this->notifyTenantAdmins($connection, $reason);
        $this->notifySuperAdmins($connection, $reason);
    }

    /**
     * Tenant-facing alert (in-app + email). Independent of any feature flag.
     */
    protected function notifyTenantAdmins(MetaConnection $connection, string $reason): void
    {
        $daysRemaining = $connection->expires_at
            ? (int) now()->diffInDays($connection->expires_at, false)
            : null;

        $admins = $this->tenantAdmins->resolveForTenant($connection->tenant_id);

        foreach ($admins as $admin) {
            try {
                $admin->notify(new MetaTokenRefreshAttentionNotification($connection, $reason, $daysRemaining));
            } catch (\Throwable $exception) {
                Log::error("Failed to notify tenant admin {$admin->id} about Meta connection issue: " . $exception->getMessage());
            }
        }
    }

    /**
     * Platform-facing alert on the super-admin panel (best-effort).
     */
    protected function notifySuperAdmins(MetaConnection $connection, string $reason): void
    {
        $tenant = Tenant::query()->find($connection->tenant_id);
        if (! $tenant) {
            return;
        }

        $this->adminEventNotifications->safe(fn () => $this->adminEventNotifications->notifyIntegrationDisconnected(
            $tenant->id,
            $tenant->name,
            'Meta',
            $reason
        ));
    }
}
