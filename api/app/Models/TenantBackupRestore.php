<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TenantBackupRestore extends Model
{
    protected $connection = 'landlord';

    protected $fillable = [
        'tenant_backup_id',
        'source_tenant_id',
        'restored_tenant_id',
        'restore_mode',
        'status',
        'requested_by_user_id',
        'metadata',
        'started_at',
        'finished_at',
        'error_message',
    ];

    protected $casts = [
        'metadata' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function backup()
    {
        return $this->belongsTo(TenantBackup::class, 'tenant_backup_id');
    }

    public function sourceTenant()
    {
        return $this->belongsTo(Tenant::class, 'source_tenant_id');
    }

    public function restoredTenant()
    {
        return $this->belongsTo(Tenant::class, 'restored_tenant_id');
    }
}
