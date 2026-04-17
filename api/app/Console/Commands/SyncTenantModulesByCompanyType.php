<?php

namespace App\Console\Commands;

use App\Models\Module;
use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

class SyncTenantModulesByCompanyType extends Command
{
    protected $signature = 'tenants:sync-modules {--tenant= : Tenant id or slug (optional)} {--dry-run : Show changes without writing}';

    protected $description = 'Disable Support for all tenants and enable Contract & Collections for Real Estate tenants';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $tenantOpt = $this->option('tenant');

        $support = Module::firstOrCreate(['slug' => 'support'], ['name' => 'Support', 'is_active' => true]);
        $cc = Module::firstOrCreate(['slug' => 'contract_collections'], ['name' => 'Contract & Collections', 'is_active' => true]);

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
            $isRealEstate = ($tenant->company_type ?? 'General') === 'Real Estate';

            $changes = [];

            $supportPivot = $tenant->modules()->where('modules.id', $support->id)->first();
            if ($supportPivot && (bool) ($supportPivot->pivot?->is_enabled ?? false) === true) {
                $changes[] = 'disable support';
                if (!$dryRun) {
                    $tenant->modules()->updateExistingPivot($support->id, ['is_enabled' => false, 'updated_at' => now()]);
                }
            }

            $ccPivot = $tenant->modules()->where('modules.id', $cc->id)->first();
            if ($isRealEstate) {
                if (!$ccPivot || (bool) ($ccPivot->pivot?->is_enabled ?? false) === false) {
                    $changes[] = 'enable contract_collections';
                    if (!$dryRun) {
                        $tenant->modules()->syncWithoutDetaching([
                            $cc->id => ['is_enabled' => true, 'created_at' => now(), 'updated_at' => now()],
                        ]);
                    }
                }
            } else {
                if ($ccPivot && (bool) ($ccPivot->pivot?->is_enabled ?? false) === true) {
                    $changes[] = 'disable contract_collections';
                    if (!$dryRun) {
                        $tenant->modules()->updateExistingPivot($cc->id, ['is_enabled' => false, 'updated_at' => now()]);
                    }
                }
            }

            if (!empty($changes)) {
                $this->info("Tenant {$tenant->id} ({$tenant->slug}): " . implode(', ', $changes));
                if (!$dryRun) {
                    Cache::forget("tenant_modules_enabled_{$tenant->id}");
                }
            } else {
                $this->line("Tenant {$tenant->id} ({$tenant->slug}): no changes");
            }
        }

        return self::SUCCESS;
    }
}

