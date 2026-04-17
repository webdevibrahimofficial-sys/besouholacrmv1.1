<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\ContractCollectionsService;
use Illuminate\Console\Command;

class MarkCcInstallmentsOverdue extends Command
{
    protected $signature = 'cc:mark-overdue {--tenant= : Tenant id or slug (optional)}';

    protected $description = 'Mark Contract & Collections installments as overdue when due_date is in the past';

    public function __construct(protected ContractCollectionsService $service)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $tenantOpt = $this->option('tenant');
        $query = Tenant::query();
        if ($tenantOpt) {
            $query->where('id', $tenantOpt)->orWhere('slug', $tenantOpt);
        }

        $tenants = $query->get();
        if ($tenants->isEmpty()) {
            $this->warn('No tenants matched.');
            return self::SUCCESS;
        }

        foreach ($tenants as $tenant) {
            $count = $this->service->markOverdueForTenant((int) $tenant->id);
            $this->info("Tenant {$tenant->id} ({$tenant->slug}): marked {$count} installments overdue");
        }

        return self::SUCCESS;
    }
}

