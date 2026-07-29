<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\TenantBackup;
use App\Models\User;
use App\Jobs\RunTenantBackupJob;

class TenantBackupService
{
    public function startDedicatedDatabaseBackup(Tenant $tenant, ?string $disk = null, ?User $requestedBy = null): TenantBackup
    {
        return $this->startBackup($tenant, [
            'scope' => 'tenant',
            'storage_disk' => $disk,
            'type' => 'manual',
        ], $requestedBy);
    }

    public function startBackup(?Tenant $tenant, array $payload = [], ?User $requestedBy = null): TenantBackup
    {
        $scope = $payload['scope'] ?? ($tenant ? 'tenant' : 'platform');
        $type = $payload['type'] ?? 'manual';
        $diskName = $payload['storage_disk'] ?? 'local';
        $source = $payload['source'] ?? 'database';

        if (!in_array($scope, ['platform', 'tenant'], true)) {
            abort(422, 'Invalid backup scope.');
        }

        if ($scope === 'tenant' && !$tenant) {
            abort(422, 'A tenant backup requires a tenant.');
        }

        if ($scope === 'platform' && $tenant) {
            abort(422, 'Platform backup cannot target a tenant.');
        }

        if (!in_array($diskName, array_keys(config('filesystems.disks', [])), true)) {
            abort(422, 'Invalid backup disk.');
        }

        $tenancyType = $scope === 'platform' ? null : $tenant->tenancy_type;
        $engine = $tenancyType === 'dedicated' ? 'spatie' : 'json-export';

        $backup = TenantBackup::create([
            'tenant_id' => $tenant?->id,
            'scope' => $scope,
            'tenancy_type' => $tenancyType,
            'type' => $type,
            'disk' => $diskName,
            'status' => 'pending',
            'source' => $source,
            'engine' => $engine,
            'requested_by_user_id' => $requestedBy?->id,
            'metadata' => [
                'logs' => [
                    'Backup request accepted',
                    $scope === 'platform'
                        ? 'Scope: Full platform'
                        : "Scope: Tenant {$tenant->name} ({$tenant->tenancy_type})",
                ],
            ],
        ]);

        RunTenantBackupJob::dispatch($tenant, $backup);

        return $backup;
    }
}
