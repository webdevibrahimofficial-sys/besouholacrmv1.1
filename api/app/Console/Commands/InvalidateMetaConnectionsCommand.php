<?php

namespace App\Console\Commands;

use App\Models\Integration;
use App\Models\MetaConnection;
use App\Models\Tenant;
use App\Models\User;
use App\Notifications\MetaReauthRequiredNotification;
use App\Services\AdminEventNotificationService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Notification;

class InvalidateMetaConnectionsCommand extends Command
{
    protected $signature = 'meta:invalidate-connections {--delete : Delete all Meta connections instead of marking them for re-auth}';

    protected $description = 'Mark existing Meta connections as needing re-authentication after shared app migration';

    public function __construct(protected AdminEventNotificationService $adminEvents)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        if ($this->option('delete')) {
            $tenantIds = MetaConnection::withoutGlobalScopes()->distinct()->pluck('tenant_id');
            $count = MetaConnection::withoutGlobalScopes()->count();
            MetaConnection::withoutGlobalScopes()->delete();
            Integration::withoutGlobalScopes()->where('provider', 'meta')->update(['status' => 'inactive']);
            $this->info("Deleted {$count} Meta connection(s).");
            foreach ($tenantIds as $tenantId) {
                $this->notifyTenantAdmins((string) $tenantId);
            }
            return self::SUCCESS;
        }

        $tenantIds = MetaConnection::withoutGlobalScopes()
            ->where('needs_reauth', false)
            ->distinct()
            ->pluck('tenant_id');

        $updated = MetaConnection::withoutGlobalScopes()
            ->where('needs_reauth', false)
            ->update(['needs_reauth' => true]);

        foreach ($tenantIds as $tenantId) {
            $this->notifyTenantAdmins((string) $tenantId);
        }

        $this->info("Marked {$updated} Meta connection(s) as needing re-authentication.");

        return self::SUCCESS;
    }

    protected function notifyTenantAdmins(string $tenantId): void
    {
        $tenant = Tenant::find($tenantId);
        $reason = 'Meta integration was migrated to a shared app. Please reconnect your Facebook account.';

        $admins = User::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where(function ($query) {
                $query->where('is_super_admin', true)
                    ->orWhereHas('roles', function ($roleQuery) {
                        $roleQuery->whereIn('name', ['Admin', 'Tenant Admin']);
                    });
            })
            ->get();

        if ($admins->isNotEmpty()) {
            Notification::send($admins, new MetaReauthRequiredNotification($reason));
        }

        $this->adminEvents->safe(fn () => $this->adminEvents->notifyMetaReauthRequired(
            (int) $tenantId,
            $tenant?->name ?? $tenantId,
            $reason
        ));
    }
}
