<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Models\TenantBackup;
use App\Models\TenantBackupRestore;
use App\Services\BackupRestoreService;
use App\Services\TenantBackupService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class SuperAdminBackupController extends Controller
{
    public function dashboard(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $base = TenantBackup::query();
        $lastSuccess = (clone $base)->where('status', 'success')->latest('finished_at')->first();

        return response()->json([
            'last_successful_backup_at' => $lastSuccess?->finished_at,
            'last_successful_backup' => $lastSuccess ? $this->transformBackup($lastSuccess) : null,
            'running_jobs' => (clone $base)->whereIn('status', ['pending', 'running'])->count(),
            'failed_backups' => (clone $base)->where('status', 'failed')->count(),
            'storage_used_bytes' => (int) ((clone $base)->sum('size_bytes') ?: 0),
            'scheduled_jobs' => 0,
            'protected_tenants' => (clone $base)->whereNotNull('tenant_id')->where('status', 'success')->distinct('tenant_id')->count('tenant_id'),
            'retention_days' => 30,
            'supported_storage' => array_values(array_keys(config('filesystems.disks', []))),
        ]);
    }

    public function history(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $hasRestoreTable = $this->hasRestoreTable();
        $query = TenantBackup::with($hasRestoreTable ? ['tenant', 'restores.restoredTenant'] : ['tenant'])->latest();

        if ($request->filled('scope')) {
            $query->where('scope', $request->string('scope'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('tenant_id')) {
            $query->where('tenant_id', $request->integer('tenant_id'));
        }

        if ($request->boolean('restored_only') && $hasRestoreTable) {
            $query->whereHas('restores');
        }

        $backups = $query->paginate(min(max((int) $request->integer('per_page', 15), 5), 100));
        $backups->through(fn (TenantBackup $backup) => $this->transformBackup($backup));

        return response()->json($backups);
    }

    public function restoreHistory(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        if (!$this->hasRestoreTable()) {
            return response()->json([
                'current_page' => 1,
                'data' => [],
                'from' => null,
                'last_page' => 1,
                'path' => $request->url(),
                'per_page' => min(max((int) $request->integer('per_page', 15), 5), 100),
                'to' => null,
                'total' => 0,
            ]);
        }

        $restores = TenantBackupRestore::with(['backup', 'sourceTenant', 'restoredTenant'])
            ->latest()
            ->paginate(min(max((int) $request->integer('per_page', 15), 5), 100));

        $restores->through(function (TenantBackupRestore $restore) {
            return [
                'id' => $restore->id,
                'backup_id' => $restore->tenant_backup_id,
                'restore_mode' => $restore->restore_mode,
                'status' => $restore->status,
                'source_tenant' => $restore->sourceTenant ? [
                    'id' => $restore->sourceTenant->id,
                    'name' => $restore->sourceTenant->name,
                    'slug' => $restore->sourceTenant->slug,
                    'domain' => $restore->sourceTenant->domain,
                ] : null,
                'restored_tenant' => $restore->restoredTenant ? [
                    'id' => $restore->restoredTenant->id,
                    'name' => $restore->restoredTenant->name,
                    'slug' => $restore->restoredTenant->slug,
                    'domain' => $restore->restoredTenant->domain,
                ] : null,
                'started_at' => $restore->started_at,
                'finished_at' => $restore->finished_at,
                'created_at' => $restore->created_at,
                'metadata' => $restore->metadata ?? [],
            ];
        });

        return response()->json($restores);
    }

    public function store(Request $request, TenantBackupService $service)
    {
        $this->authorizeSuperAdmin($request);

        $validated = $request->validate([
            'scope' => 'required|string|in:platform,tenant',
            'tenant_id' => 'nullable|integer|exists:tenants,id',
            'type' => 'nullable|string|in:manual,scheduled,pre_delete,pre_migration,pre_deployment',
            'storage_disk' => 'nullable|string',
            'source' => 'nullable|string|in:database,files,full',
        ]);

        $tenant = null;
        if (($validated['scope'] ?? null) === 'tenant') {
            $tenant = Tenant::findOrFail($validated['tenant_id'] ?? 0);
        }

        $backup = $service->startBackup($tenant, $validated, $request->user());

        return response()->json([
            'message' => 'Backup started',
            'backup' => $this->transformBackup($backup),
        ], 202);
    }

    public function show(Request $request, TenantBackup $backup)
    {
        $this->authorizeSuperAdmin($request);

        $backup->loadMissing('tenant');

        return response()->json([
            'backup' => $this->transformBackup($backup),
        ]);
    }

    public function backupNow(Request $request, Tenant $tenant, TenantBackupService $service)
    {
        $this->authorizeSuperAdmin($request);

        $backup = $service->startBackup($tenant, [
            'scope' => 'tenant',
            'type' => 'manual',
            'storage_disk' => $request->input('storage_disk'),
            'source' => 'database',
        ], $request->user());

        return response()->json([
            'message' => 'Backup started',
            'backup' => $this->transformBackup($backup),
        ], 202);
    }

    public function listBackups(Request $request, Tenant $tenant)
    {
        $this->authorizeSuperAdmin($request);

        $backups = $tenant->backups()->latest()->paginate(20);
        $backups->through(fn (TenantBackup $backup) => $this->transformBackup($backup));

        return response()->json($backups);
    }

    public function download(Request $request, Tenant $tenant, TenantBackup $backup)
    {
        $this->authorizeSuperAdmin($request);

        if ($backup->tenant_id !== $tenant->id) {
            abort(404);
        }

        return $this->streamBackupDownload($backup);
    }

    public function downloadAny(Request $request, TenantBackup $backup)
    {
        $this->authorizeSuperAdmin($request);

        return $this->streamBackupDownload($backup);
    }

    public function destroy(Request $request, TenantBackup $backup)
    {
        $this->authorizeSuperAdmin($request);

        if ($backup->path && $backup->disk) {
            $disk = Storage::disk($backup->disk);
            if ($disk->exists($backup->path)) {
                $disk->delete($backup->path);
            }
        }

        $backup->delete();

        return response()->json([
            'message' => 'Backup deleted successfully.',
        ]);
    }

    public function restore(Request $request, TenantBackup $backup, BackupRestoreService $restoreService)
    {
        $this->authorizeSuperAdmin($request);

        $validated = $request->validate([
            'mode' => 'nullable|string|in:new_tenant_copy',
        ]);

        $mode = $validated['mode'] ?? 'new_tenant_copy';
        abort_unless($mode === 'new_tenant_copy', 422, 'Only restore to new tenant copy is supported in this MVP.');

        $result = $restoreService->restoreToNewTenantCopy($backup);

        return response()->json([
            'message' => $result['message'],
            'tenant' => [
                'id' => $result['tenant']->id,
                'name' => $result['tenant']->name,
                'slug' => $result['tenant']->slug,
                'domain' => $result['tenant']->domain,
            ],
        ]);
    }

    protected function streamBackupDownload(TenantBackup $backup)
    {
        if (!$backup->path || !$backup->disk) {
            abort(404);
        }

        /** @var \Illuminate\Filesystem\FilesystemAdapter $disk */
        $disk = Storage::disk($backup->disk);

        if (!$disk->exists($backup->path)) {
            abort(404);
        }

        $filename = basename($backup->path);
        
        $mime = method_exists($disk, 'mimeType') ? ($disk->mimeType($backup->path) ?: 'application/octet-stream') : 'application/octet-stream';
        $stream = method_exists($disk, 'readStream') ? $disk->readStream($backup->path) : null;
        if (!$stream) {
            abort(500, 'Unable to read backup stream');
        }
        return response()->streamDownload(function() use ($stream) {
            fpassthru($stream);
            if (is_resource($stream)) {
                fclose($stream);
            }
        }, $filename, ['Content-Type' => $mime]);
    }

    protected function transformBackup(TenantBackup $backup): array
    {
        $backup->loadMissing('tenant');
        $metadata = $backup->metadata ?? [];
        $restoredTenants = is_array($metadata['restored_tenants'] ?? null) ? $metadata['restored_tenants'] : [];
        $latestRestoredTenant = null;
        $restoreCount = 0;

        if ($this->hasRestoreTable()) {
            $backup->loadMissing('restores.restoredTenant');
            $latestRestoredTenant = $backup->restores->sortByDesc('id')->first()?->restoredTenant;
            $restoreCount = $backup->restores->count();
        }

        return [
            'id' => $backup->id,
            'scope' => $backup->scope ?? ($backup->tenant_id ? 'tenant' : 'platform'),
            'tenant_id' => $backup->tenant_id,
            'tenant_name' => $backup->tenant?->name,
            'tenant_slug' => $backup->tenant?->slug,
            'tenancy_type' => $backup->tenancy_type,
            'type' => $backup->type,
            'disk' => $backup->disk,
            'path' => $backup->path,
            'status' => $backup->status,
            'source' => $backup->source,
            'engine' => $backup->engine,
            'size_bytes' => $backup->size_bytes,
            'checksum' => $backup->checksum,
            'requested_by_user_id' => $backup->requested_by_user_id,
            'expires_at' => $backup->expires_at,
            'error_message' => $backup->error_message,
            'started_at' => $backup->started_at,
            'finished_at' => $backup->finished_at,
            'created_at' => $backup->created_at,
            'metadata' => $metadata,
            'restored_tenants' => array_values($restoredTenants),
            'latest_restored_tenant' => $latestRestoredTenant ? [
                'id' => $latestRestoredTenant->id,
                'name' => $latestRestoredTenant->name,
                'slug' => $latestRestoredTenant->slug,
                'domain' => $latestRestoredTenant->domain,
            ] : null,
            'restore_count' => $restoreCount,
        ];
    }

    protected function hasRestoreTable(): bool
    {
        return Schema::connection('landlord')->hasTable('tenant_backup_restores');
    }

    protected function authorizeSuperAdmin(Request $request): void
    {
        $user = $request->user();
        if (!$user || !$user->is_super_admin) {
            abort(403, 'Unauthorized');
        }
    }
}
