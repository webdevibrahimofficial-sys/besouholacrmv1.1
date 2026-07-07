<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TenantBackup extends Model
{
    protected $connection = 'landlord';

    protected $fillable = [
        'tenant_id',
        'scope',
        'tenancy_type',
        'type',
        'disk',
        'path',
        'status',
        'source',
        'engine',
        'size_bytes',
        'checksum',
        'metadata',
        'requested_by_user_id',
        'expires_at',
        'error_message',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'metadata' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function restores()
    {
        return $this->hasMany(TenantBackupRestore::class, 'tenant_backup_id');
    }
}
