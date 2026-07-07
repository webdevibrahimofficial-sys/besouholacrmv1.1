<?php

namespace App\Jobs;

use App\Models\Tenant;
use App\Models\TenantBackup;
use App\Services\BackupExportService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Spatie\Multitenancy\Jobs\NotTenantAware;
use Throwable;

class RunTenantBackupJob implements ShouldQueue, NotTenantAware
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public ?Tenant $tenant;
    public TenantBackup $backup;

    public function __construct(?Tenant $tenant, TenantBackup $backup)
    {
        $this->tenant = $tenant;
        $this->backup = $backup;
    }

    public function handle(BackupExportService $exportService): void
    {
        $backup = $this->backup->fresh();

        if (!$backup || $backup->status !== 'pending') {
            return;
        }

        $backup->update([
            'status' => 'running',
            'started_at' => now(),
        ]);

        try {
            $result = $exportService->run($backup, $this->tenant);

            $backup->update([
                'status' => 'success',
                'path' => $result['path'] ?? null,
                'size_bytes' => $result['size_bytes'] ?? null,
                'checksum' => $result['checksum'] ?? null,
                'metadata' => $result['metadata'] ?? $backup->metadata,
                'finished_at' => now(),
            ]);
        } catch (Throwable $e) {
            $metadata = $backup->metadata ?: [];
            $logs = $metadata['logs'] ?? [];
            $logs[] = 'Backup failed';
            $logs[] = $e->getMessage();

            $backup->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'metadata' => array_merge($metadata, ['logs' => $logs]),
                'finished_at' => now(),
            ]);

            throw $e;
        }
    }
}
