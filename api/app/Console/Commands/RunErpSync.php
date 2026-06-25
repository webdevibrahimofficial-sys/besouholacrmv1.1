<?php

namespace App\Console\Commands;

use App\Jobs\RunErpSyncJob;
use App\Models\ErpSetting;
use App\Models\Tenant;
use App\Services\ErpSyncService;
use Illuminate\Console\Command;

class RunErpSync extends Command
{
    protected $signature = 'erp:sync {--tenant_id= : Sync one tenant only} {--now : Run immediately instead of queueing}';

    protected $description = 'Run ERP sync for tenants with valid ERP configuration';

    public function handle(ErpSyncService $service): int
    {
        $tenantId = $this->option('tenant_id');

        $query = ErpSetting::query()
            ->whereNotNull('base_url')
            ->where('base_url', '!=', '');

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $settingsRows = $query->get();

        if ($settingsRows->isEmpty()) {
            $this->info('No ERP settings with a configured base_url were found.');
            return self::SUCCESS;
        }

        $queued = 0;
        $ran = 0;
        $failed = 0;

        foreach ($settingsRows as $settings) {
            $tenant = Tenant::find($settings->tenant_id);
            if (!$tenant) {
                $failed++;
                $this->warn("Skipping tenant {$settings->tenant_id}: tenant not found.");
                continue;
            }

            try {
                if ($this->option('now')) {
                    $service->run($tenant, null, []);
                    $ran++;
                    $this->info("ERP sync completed for tenant {$tenant->id}.");
                } else {
                    RunErpSyncJob::dispatch($tenant->id, null, []);
                    $queued++;
                    $this->info("ERP sync queued for tenant {$tenant->id}.");
                }
            } catch (\Throwable $e) {
                report($e);
                $failed++;
                $this->error("ERP sync failed for tenant {$tenant->id}: {$e->getMessage()}");
            }
        }

        $this->info("ERP sync finished. Queued: {$queued}, Ran now: {$ran}, Failed: {$failed}");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
