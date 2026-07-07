<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\TenantBackup;
use App\Models\TenantBackupRestore;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

class BackupRestoreService
{
    public function restoreToNewTenantCopy(TenantBackup $backup): array
    {
        if (($backup->scope ?? 'tenant') !== 'tenant') {
            abort(422, 'Only tenant backups can be restored in this MVP.');
        }

        if ($backup->status !== 'success' || !$backup->path || !$backup->disk) {
            abort(422, 'Only successful backups with a stored file can be restored.');
        }

        if (($backup->tenancy_type ?? null) === 'dedicated') {
            return $this->restoreDedicatedTenantToNewCopy($backup);
        }

        if (($backup->tenancy_type ?? null) !== 'shared') {
            abort(422, 'Restore is currently supported only for shared and dedicated tenant backups.');
        }

        return $this->restoreSharedTenantToNewCopy($backup);
    }

    protected function restoreSharedTenantToNewCopy(TenantBackup $backup): array
    {
        $sourceTenant = Tenant::findOrFail($backup->tenant_id);
        $tmpDir = $this->extractBackup($backup);

        try {
            $metadataPath = $tmpDir . DIRECTORY_SEPARATOR . 'metadata.json';
            abort_unless(is_file($metadataPath), 422, 'Backup metadata file is missing.');

            $metadata = json_decode((string) file_get_contents($metadataPath), true);
            abort_unless(is_array($metadata), 422, 'Backup metadata is invalid.');

            $restoredTenant = DB::connection('landlord')->transaction(function () use ($sourceTenant, $metadata, $tmpDir, $backup) {
                $restoreRecord = $this->createRestoreRecord($backup, $sourceTenant);
                $tenant = $this->createSharedRestoredTenant($sourceTenant, $backup);
                $idMaps = [];
                $pendingUpdates = [];

                $tableFiles = collect($metadata['exported_tables'] ?? [])
                    ->pluck('table')
                    ->filter()
                    ->values()
                    ->all();

                $remaining = $tableFiles;
                $safetyCounter = 0;

                while (!empty($remaining) && $safetyCounter < 100) {
                    $progress = false;
                    $nextRemaining = [];

                    foreach ($remaining as $table) {
                        $dependencies = $this->getRestorableDependencies($table, $tableFiles);
                        $unresolved = array_filter($dependencies, fn ($dependency) => !array_key_exists($dependency, $idMaps) && $dependency !== $table);

                        if (!empty($unresolved)) {
                            $nextRemaining[] = $table;
                            continue;
                        }

                        $this->restoreTableRows($table, $tmpDir, $tenant, $idMaps, $pendingUpdates);
                        $progress = true;
                    }

                    if (!$progress) {
                        foreach ($nextRemaining as $table) {
                            $this->restoreTableRows($table, $tmpDir, $tenant, $idMaps, $pendingUpdates, true);
                        }
                        $remaining = [];
                        break;
                    }

                    $remaining = $nextRemaining;
                    $safetyCounter++;
                }

                $this->applyPendingUpdates($pendingUpdates, $idMaps);
                $this->markTenantAsRestored($tenant, $backup, $sourceTenant);
                $this->appendRestoreMetadata($backup, $tenant);
                $this->completeRestoreRecord($restoreRecord, $tenant);

                return $tenant->fresh(['modules']);
            });

            return [
                'tenant' => $restoredTenant,
                'message' => 'Backup restored to a new tenant copy.',
            ];
        } finally {
            File::deleteDirectory(dirname($tmpDir));
        }
    }

    protected function restoreDedicatedTenantToNewCopy(TenantBackup $backup): array
    {
        $sourceTenant = Tenant::findOrFail($backup->tenant_id);
        $tmpDir = $this->extractBackup($backup);

        try {
            $sqlPath = $this->findFirstSqlFile($tmpDir);
            abort_unless($sqlPath, 422, 'No SQL dump was found inside the dedicated backup archive.');

            $restoredTenant = DB::connection('landlord')->transaction(function () use ($sourceTenant, $backup, $sqlPath) {
                $restoreRecord = $this->createRestoreRecord($backup, $sourceTenant);
                $tenant = $this->createDedicatedRestoredTenant($sourceTenant, $backup);
                $this->importSqlDumpIntoDedicatedDatabase($tenant, $sqlPath);
                $this->markTenantAsRestored($tenant, $backup, $sourceTenant);
                $this->appendRestoreMetadata($backup, $tenant);
                $this->completeRestoreRecord($restoreRecord, $tenant);

                return $tenant;
            });

            return [
                'tenant' => $restoredTenant,
                'message' => 'Dedicated backup restored to a new tenant copy.',
            ];
        } finally {
            File::deleteDirectory(dirname($tmpDir));
        }
    }

    protected function createSharedRestoredTenant(Tenant $sourceTenant, TenantBackup $backup): Tenant
    {
        $suffix = 'restore-' . strtolower(Str::random(5));
        $host = parse_url(config('app.url'), PHP_URL_HOST) ?: 'besouholacrm.net';
        $baseEmail = $sourceTenant->owner?->email ?: "tenant{$sourceTenant->id}@example.invalid";
        [$localPart, $domainPart] = array_pad(explode('@', $baseEmail, 2), 2, 'example.invalid');

        $tenant = Tenant::create([
            'name' => "{$sourceTenant->name} Restored Copy",
            'slug' => Str::limit($sourceTenant->slug, 48, '') . '-' . $suffix,
            'domain' => Str::limit($sourceTenant->slug, 48, '') . '-' . $suffix . '.' . $host,
            'status' => 'active',
            'tenancy_type' => 'shared',
            'subscription_plan' => $sourceTenant->subscription_plan,
            'company_type' => $sourceTenant->company_type,
            'users_limit' => $sourceTenant->users_limit,
            'start_date' => now()->toDateString(),
            'end_date' => $sourceTenant->end_date,
            'country' => $sourceTenant->country,
            'city' => $sourceTenant->city,
            'state' => $sourceTenant->state,
            'address_line_1' => $sourceTenant->address_line_1,
            'address_line_2' => $sourceTenant->address_line_2,
            'meta_data' => [
                'restored_copy' => true,
                'backup_id' => $backup->id,
            ],
        ]);

        app(TenantBootstrapper::class)->bootstrap($tenant, [
            'name' => ($sourceTenant->owner?->name ?: $sourceTenant->name) . ' Restored Admin',
            'email' => "{$localPart}+{$suffix}@{$domainPart}",
            'password' => Str::random(20),
        ]);

        $this->syncSourceTenantModules($sourceTenant, $tenant);
        app(TenantService::class)->ensureDefaultSources($tenant);

        return $tenant;
    }

    protected function createDedicatedRestoredTenant(Tenant $sourceTenant, TenantBackup $backup): Tenant
    {
        $suffix = 'restore-' . strtolower(Str::random(5));
        $slugBase = Str::limit($sourceTenant->slug, 48, '');
        $host = parse_url(config('app.url'), PHP_URL_HOST) ?: 'besouholacrm.net';

        $tenant = new Tenant();
        $tenant->setConnection('landlord');
        $tenant->name = "{$sourceTenant->name} Restored Copy";
        $tenant->slug = "{$slugBase}-{$suffix}";
        $tenant->domain = "{$slugBase}-{$suffix}.{$host}";
        $tenant->status = 'active';
        $tenant->tenancy_type = 'dedicated';
        $tenant->subscription_plan = $sourceTenant->subscription_plan;
        $tenant->company_type = $sourceTenant->company_type;
        $tenant->users_limit = $sourceTenant->users_limit;
        $tenant->start_date = now()->toDateString();
        $tenant->end_date = $sourceTenant->end_date;
        $tenant->country = $sourceTenant->country;
        $tenant->city = $sourceTenant->city;
        $tenant->state = $sourceTenant->state;
        $tenant->address_line_1 = $sourceTenant->address_line_1;
        $tenant->address_line_2 = $sourceTenant->address_line_2;
        $tenant->meta_data = [
            'restored_copy' => true,
            'backup_id' => $backup->id,
        ];
        $tenant->save();

        $dbHost = config('database.connections.mysql.host');
        $dbPort = config('database.connections.mysql.port');
        $databaseName = 'tenant_' . $tenant->id . '_' . Str::random(6);
        $username = 'tenant_' . $tenant->id . '_' . Str::lower(Str::random(4));
        $password = Str::random(32);

        DB::connection('landlord')->statement("CREATE DATABASE `{$databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        DB::connection('landlord')->statement("CREATE USER '{$username}'@'%' IDENTIFIED BY '{$password}'");
        DB::connection('landlord')->statement("GRANT ALL PRIVILEGES ON `{$databaseName}`.* TO '{$username}'@'%'");
        DB::connection('landlord')->statement('FLUSH PRIVILEGES');

        $tenant->db_connection_details = [
            'driver' => 'mysql',
            'host' => $dbHost,
            'port' => $dbPort,
            'database' => $databaseName,
            'username' => $username,
            'password' => $password,
        ];
        $tenant->save();

        $this->syncSourceTenantModules($sourceTenant, $tenant);
        app(TenantService::class)->ensureDefaultSources($tenant);

        return $tenant;
    }

    protected function syncSourceTenantModules(Tenant $sourceTenant, Tenant $targetTenant): void
    {
        $moduleSync = $sourceTenant->modules()
            ->get()
            ->mapWithKeys(fn ($module) => [
                $module->id => [
                    'is_enabled' => (bool) ($module->pivot->is_enabled ?? true),
                    'config' => $module->pivot->config,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            ])
            ->toArray();

        if (!empty($moduleSync)) {
            $targetTenant->modules()->sync($moduleSync);
        }
    }

    protected function restoreTableRows(
        string $table,
        string $tmpDir,
        Tenant $tenant,
        array &$idMaps,
        array &$pendingUpdates,
        bool $allowDeferred = false
    ): void {
        $filePath = $tmpDir . DIRECTORY_SEPARATOR . "{$table}.json";
        if (!is_file($filePath)) {
            return;
        }

        $rows = json_decode((string) file_get_contents($filePath), true);
        if (!is_array($rows) || empty($rows)) {
            return;
        }

        $primaryKey = Schema::connection('mysql')->getColumnListing($table);
        $primaryKey = in_array('id', $primaryKey, true) ? 'id' : null;
        $foreignKeys = $this->getForeignKeysForTable($table);

        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }

            $originalId = $primaryKey ? ($row[$primaryKey] ?? null) : null;
            $payload = $row;

            if (array_key_exists('tenant_id', $payload)) {
                $payload['tenant_id'] = $tenant->id;
            }

            foreach ($foreignKeys as $column => $referenceTable) {
                if (!array_key_exists($column, $payload) || $payload[$column] === null) {
                    continue;
                }

                if (isset($idMaps[$referenceTable][$payload[$column]])) {
                    $payload[$column] = $idMaps[$referenceTable][$payload[$column]];
                    continue;
                }

                if ($referenceTable === $table || $allowDeferred) {
                    $pendingUpdates[] = [
                        'table' => $table,
                        'column' => $column,
                        'reference_table' => $referenceTable,
                        'original_reference_id' => $payload[$column],
                        'row_original_id' => $originalId,
                    ];
                    $payload[$column] = null;
                }
            }

            if ($primaryKey && array_key_exists($primaryKey, $payload)) {
                unset($payload[$primaryKey]);
            }

            $newId = DB::connection('mysql')->table($table)->insertGetId($payload);

            if ($primaryKey && $originalId !== null) {
                $idMaps[$table][$originalId] = $newId;
            }
        }
    }

    protected function applyPendingUpdates(array $pendingUpdates, array $idMaps): void
    {
        foreach ($pendingUpdates as $update) {
            $rowId = $idMaps[$update['table']][$update['row_original_id']] ?? null;
            $referenceId = $idMaps[$update['reference_table']][$update['original_reference_id']] ?? null;

            if (!$rowId || !$referenceId) {
                continue;
            }

            DB::connection('mysql')
                ->table($update['table'])
                ->where('id', $rowId)
                ->update([$update['column'] => $referenceId]);
        }
    }

    protected function getRestorableDependencies(string $table, array $restorableTables): array
    {
        return array_values(array_intersect(
            array_values($this->getForeignKeysForTable($table)),
            $restorableTables
        ));
    }

    protected function getForeignKeysForTable(string $table): array
    {
        $database = config('database.connections.mysql.database');
        $rows = DB::connection('mysql')->select(
            'SELECT COLUMN_NAME, REFERENCED_TABLE_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL',
            [$database, $table]
        );

        $foreignKeys = [];
        foreach ($rows as $row) {
            $foreignKeys[$row->COLUMN_NAME] = $row->REFERENCED_TABLE_NAME;
        }

        return $foreignKeys;
    }

    protected function extractBackup(TenantBackup $backup): string
    {
        $disk = Storage::disk($backup->disk);
        abort_unless($disk->exists($backup->path), 404, 'Backup file not found.');

        $tempDir = storage_path('app/tmp/restore-' . $backup->id . '-' . uniqid());
        File::ensureDirectoryExists($tempDir);

        $archivePath = $tempDir . DIRECTORY_SEPARATOR . 'backup.zip';
        file_put_contents($archivePath, $disk->get($backup->path));

        $zip = new ZipArchive();
        if ($zip->open($archivePath) !== true) {
            abort(422, 'Unable to open backup archive.');
        }

        $extractDir = $tempDir . DIRECTORY_SEPARATOR . 'contents';
        File::ensureDirectoryExists($extractDir);
        $zip->extractTo($extractDir);
        $zip->close();

        File::delete($archivePath);

        return $extractDir;
    }

    protected function findFirstSqlFile(string $directory): ?string
    {
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($directory, \FilesystemIterator::SKIP_DOTS)
        );

        foreach ($iterator as $file) {
            if ($file->isFile() && strtolower($file->getExtension()) === 'sql') {
                return $file->getRealPath();
            }
        }

        return null;
    }

    protected function importSqlDumpIntoDedicatedDatabase(Tenant $tenant, string $sqlPath): void
    {
        $details = $tenant->db_connection_details ?? [];
        abort_unless(is_array($details) && !empty($details['database']), 422, 'Dedicated tenant database details are missing.');

        Config::set('database.connections.tenant-dedicated', array_merge(
            config('database.connections.tenant-dedicated', []),
            $details
        ));

        DB::purge('tenant-dedicated');
        $pdo = DB::connection('tenant-dedicated')->getPdo();
        $pdo->exec('SET FOREIGN_KEY_CHECKS=0');

        foreach ($this->splitSqlStatements((string) file_get_contents($sqlPath)) as $statement) {
            $trimmed = trim($statement);
            if ($trimmed === '') {
                continue;
            }

            $pdo->exec($statement);
        }

        $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
        DB::purge('tenant-dedicated');
    }

    protected function splitSqlStatements(string $sql): array
    {
        $statements = [];
        $buffer = '';
        $inSingleQuote = false;
        $inDoubleQuote = false;
        $inBacktick = false;
        $length = strlen($sql);

        for ($i = 0; $i < $length; $i++) {
            $char = $sql[$i];
            $next = $i + 1 < $length ? $sql[$i + 1] : null;

            if (!$inSingleQuote && !$inDoubleQuote && !$inBacktick) {
                if ($char === '-' && $next === '-') {
                    while ($i < $length && $sql[$i] !== "\n") {
                        $i++;
                    }
                    continue;
                }

                if ($char === '#') {
                    while ($i < $length && $sql[$i] !== "\n") {
                        $i++;
                    }
                    continue;
                }

                if ($char === '/' && $next === '*') {
                    $i += 2;
                    while ($i < $length - 1 && !($sql[$i] === '*' && $sql[$i + 1] === '/')) {
                        $i++;
                    }
                    $i++;
                    continue;
                }
            }

            if ($char === "'" && !$inDoubleQuote && !$inBacktick && ($i === 0 || $sql[$i - 1] !== '\\')) {
                $inSingleQuote = !$inSingleQuote;
            } elseif ($char === '"' && !$inSingleQuote && !$inBacktick && ($i === 0 || $sql[$i - 1] !== '\\')) {
                $inDoubleQuote = !$inDoubleQuote;
            } elseif ($char === '`' && !$inSingleQuote && !$inDoubleQuote) {
                $inBacktick = !$inBacktick;
            }

            if ($char === ';' && !$inSingleQuote && !$inDoubleQuote && !$inBacktick) {
                $statements[] = $buffer;
                $buffer = '';
                continue;
            }

            $buffer .= $char;
        }

        if (trim($buffer) !== '') {
            $statements[] = $buffer;
        }

        return $statements;
    }

    protected function appendRestoreMetadata(TenantBackup $backup, Tenant $tenant): void
    {
        $backupMeta = is_array($backup->metadata) ? $backup->metadata : [];
        $backupLogs = $backupMeta['logs'] ?? [];
        $backupLogs[] = "Restore completed to tenant {$tenant->name} (#{$tenant->id})";
        $backupMeta['logs'] = $backupLogs;
        $backupMeta['restored_tenants'] = array_values(array_merge(
            $backupMeta['restored_tenants'] ?? [],
            [[
                'tenant_id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'domain' => $tenant->domain,
                'restored_at' => now()->toIso8601String(),
            ]]
        ));
        $backup->metadata = $backupMeta;
        $backup->save();
    }

    protected function createRestoreRecord(TenantBackup $backup, Tenant $sourceTenant): TenantBackupRestore
    {
        return TenantBackupRestore::create([
            'tenant_backup_id' => $backup->id,
            'source_tenant_id' => $sourceTenant->id,
            'restore_mode' => 'new_tenant_copy',
            'status' => 'running',
            'requested_by_user_id' => $backup->requested_by_user_id,
            'started_at' => now(),
            'metadata' => [
                'backup_scope' => $backup->scope,
                'tenancy_type' => $backup->tenancy_type,
            ],
        ]);
    }

    protected function completeRestoreRecord(TenantBackupRestore $restore, Tenant $restoredTenant): void
    {
        $meta = is_array($restore->metadata) ? $restore->metadata : [];
        $meta['restored_tenant'] = [
            'id' => $restoredTenant->id,
            'name' => $restoredTenant->name,
            'slug' => $restoredTenant->slug,
            'domain' => $restoredTenant->domain,
        ];

        $restore->update([
            'restored_tenant_id' => $restoredTenant->id,
            'status' => 'success',
            'finished_at' => now(),
            'metadata' => $meta,
        ]);
    }

    protected function markTenantAsRestored(Tenant $tenant, TenantBackup $backup, Tenant $sourceTenant): void
    {
        $meta = is_array($tenant->meta_data) ? $tenant->meta_data : [];
        $meta['restored_from_backup'] = [
            'backup_id' => $backup->id,
            'source_tenant_id' => $sourceTenant->id,
            'source_tenant_name' => $sourceTenant->name,
            'restored_at' => now()->toIso8601String(),
        ];
        $tenant->meta_data = $meta;
        $tenant->save();
    }
}
