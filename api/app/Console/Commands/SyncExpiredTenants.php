<?php

namespace App\Console\Commands;

use App\Services\TenantStatusService;
use Illuminate\Console\Command;

class SyncExpiredTenants extends Command
{
    protected $signature = 'tenants:sync-expired';

    protected $description = 'Mark ended tenant subscriptions as expired and revoke their active tokens';

    public function handle(TenantStatusService $tenantStatusService): int
    {
        $updated = $tenantStatusService->syncExpiredTenants();
        $this->info("Expired tenants synced: {$updated}");

        return self::SUCCESS;
    }
}
