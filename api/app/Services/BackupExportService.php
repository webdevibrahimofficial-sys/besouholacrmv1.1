<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\TenantBackup;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use ZipArchive;

class BackupExportService
{
    public function run(TenantBackup $backup, ?Tenant $tenant = null): array
    {
        if ($backup->scope === 'platform') {
            return $this->runPlatformExport($backup);
        }

        if (($backup->tenancy_type ?? $tenant?->tenancy_type) === 'shared') {
            return $this->runSharedTenantExport($backup, $tenant);
        }

        return $this->runDedicatedTenantBackup($backup, $tenant);
    }

    protected function runDedicatedTenantBackup(TenantBackup $backup, ?Tenant $tenant): array
    {
        abort_unless($tenant, 422, 'Dedicated backup requires a tenant.');

        $logs = [
            'Backup started',
            "Tenant resolved: {$tenant->name} (#{$tenant->id})",
            'Dedicated database backup started via spatie/laravel-backup',
        ];

        $tenant->makeCurrent();
        try {
            Artisan::call('backup:run', [
                '--only-db' => true,
                '--only-to-disk' => $backup->disk,
            ]);
        } finally {
            $tenant->forget();
        }

        $disk = Storage::disk($backup->disk);
        $path = $this->guessLatestBackupPath($disk);
        $size = $path ? $disk->size($path) : null;
        $checksum = null;
        if ($path && method_exists($disk, 'path')) {
            $absolutePath = $disk->path($path);
            if (is_string($absolutePath) && is_file($absolutePath)) {
                $checksum = hash_file('sha256', $absolutePath);
            }
        }

        $logs[] = 'Database dump finished';
        $logs[] = $path ? "Backup stored: {$path}" : 'Backup completed but no file path was discovered';

        return [
            'path' => $path,
            'size_bytes' => $size,
            'checksum' => $checksum,
            'metadata' => [
                'logs' => $logs,
                'summary' => [
                    'mode' => 'dedicated_database_dump',
                    'database' => $tenant->getDatabaseName(),
                ],
            ],
        ];
    }

    protected function runSharedTenantExport(TenantBackup $backup, ?Tenant $tenant): array
    {
        abort_unless($tenant, 422, 'Shared backup requires a tenant.');

        $tmpDir = $this->makeTempDirectory("shared-tenant-{$tenant->id}-{$backup->id}");
        $logs = [
            'Backup started',
            "Tenant resolved: {$tenant->name} (#{$tenant->id})",
            'Scanning shared-database tables with tenant_id',
        ];

        $tables = $this->getTablesForConnection('mysql');
        $exportedTables = [];
        $totalRows = 0;

        foreach ($tables as $table) {
            if (!Schema::connection('mysql')->hasColumn($table, 'tenant_id')) {
                continue;
            }

            $rows = DB::connection('mysql')
                ->table($table)
                ->where('tenant_id', $tenant->id)
                ->get()
                ->map(fn ($row) => (array) $row)
                ->all();

            if (count($rows) === 0) {
                continue;
            }

            $totalRows += count($rows);
            $exportedTables[] = [
                'table' => $table,
                'rows' => count($rows),
            ];

            File::put(
                $tmpDir . DIRECTORY_SEPARATOR . "{$table}.json",
                json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            );
        }

        File::put(
            $tmpDir . DIRECTORY_SEPARATOR . 'metadata.json',
            json_encode([
                'scope' => 'tenant',
                'tenancy_type' => 'shared',
                'tenant' => [
                    'id' => $tenant->id,
                    'name' => $tenant->name,
                    'slug' => $tenant->slug,
                    'domain' => $tenant->domain,
                ],
                'exported_tables' => $exportedTables,
                'generated_at' => now()->toIso8601String(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );

        $logs[] = 'Tenant-scoped data export completed';
        $logs[] = sprintf('Exported %d tables and %d rows', count($exportedTables), $totalRows);

        return $this->zipDirectoryToDisk(
            $backup,
            $tmpDir,
            "tenant-backups/shared/tenant-{$tenant->id}",
            "tenant_{$tenant->id}_shared_backup_" . now()->format('Y_m_d_His') . '.zip',
            $logs,
            [
                'summary' => [
                    'mode' => 'shared_tenant_export',
                    'tables' => count($exportedTables),
                    'rows' => $totalRows,
                ],
                'exported_tables' => $exportedTables,
            ]
        );
    }

    protected function runPlatformExport(TenantBackup $backup): array
    {
        $tmpDir = $this->makeTempDirectory("platform-{$backup->id}");
        $logs = [
            'Backup started',
            'Preparing platform backup package',
        ];

        $manifest = [
            'scope' => 'platform',
            'mode' => 'database_snapshot',
            'generated_at' => now()->toIso8601String(),
            'connections' => [],
        ];

        foreach (['landlord', 'mysql'] as $connection) {
            $connectionDir = $tmpDir . DIRECTORY_SEPARATOR . $connection;
            File::ensureDirectoryExists($connectionDir);

            $tables = $this->getTablesForConnection($connection);
            $logs[] = sprintf('Exporting %d tables from %s connection', count($tables), $connection);

            foreach ($tables as $table) {
                $rows = DB::connection($connection)
                    ->table($table)
                    ->get()
                    ->map(fn ($row) => (array) $row)
                    ->all();

                File::put(
                    $connectionDir . DIRECTORY_SEPARATOR . "{$table}.json",
                    json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
                );

                $manifest['connections'][$connection][] = [
                    'table' => $table,
                    'rows' => count($rows),
                ];
            }
        }

        File::put(
            $tmpDir . DIRECTORY_SEPARATOR . 'manifest.json',
            json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );

        $logs[] = 'Platform snapshot completed';

        return $this->zipDirectoryToDisk(
            $backup,
            $tmpDir,
            'tenant-backups/platform',
            'platform_backup_' . now()->format('Y_m_d_His') . '.zip',
            $logs,
            ['summary' => $manifest]
        );
    }

    protected function zipDirectoryToDisk(
        TenantBackup $backup,
        string $sourceDir,
        string $targetDirectory,
        string $filename,
        array $logs,
        array $metadata
    ): array {
        $disk = Storage::disk($backup->disk);
        $relativePath = trim($targetDirectory, '/') . '/' . $filename;
        $zipPath = storage_path('app/tmp/' . uniqid('backup-zip-', true) . '.zip');

        File::ensureDirectoryExists(dirname($zipPath));

        $zip = new ZipArchive();
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            abort(500, 'Unable to create backup archive.');
        }

        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($sourceDir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::LEAVES_ONLY
        );

        foreach ($files as $file) {
            $realPath = $file->getRealPath();
            $relativeName = str_replace($sourceDir . DIRECTORY_SEPARATOR, '', $realPath);
            $zip->addFile($realPath, str_replace(DIRECTORY_SEPARATOR, '/', $relativeName));
        }

        $zip->close();

        $stream = fopen($zipPath, 'rb');
        $disk->put($relativePath, $stream);
        if (is_resource($stream)) {
            fclose($stream);
        }

        $size = $disk->size($relativePath);
        $checksum = hash_file('sha256', $zipPath);

        File::delete($zipPath);
        File::deleteDirectory($sourceDir);

        return [
            'path' => $relativePath,
            'size_bytes' => $size,
            'checksum' => $checksum,
            'metadata' => array_merge($metadata, ['logs' => $logs]),
        ];
    }

    protected function makeTempDirectory(string $name): string
    {
        $dir = storage_path('app/tmp/' . $name);
        File::deleteDirectory($dir);
        File::ensureDirectoryExists($dir);

        return $dir;
    }

    protected function getTablesForConnection(string $connection): array
    {
        $tables = DB::connection($connection)->select('SHOW TABLES');
        $names = [];

        foreach ($tables as $table) {
            $row = (array) $table;
            $names[] = (string) reset($row);
        }

        sort($names);

        return $names;
    }

    protected function guessLatestBackupPath($disk): ?string
    {
        $allFiles = $disk->allFiles('Laravel');
        if (empty($allFiles)) {
            return null;
        }

        usort($allFiles, function ($a, $b) use ($disk) {
            return $disk->lastModified($b) <=> $disk->lastModified($a);
        });

        return $allFiles[0];
    }
}
