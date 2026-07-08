<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AdminNotification extends Model
{
    use HasFactory;
    use HasUuids;

    protected $fillable = [
        'admin_user_id',
        'related_tenant_id',
        'type',
        'title',
        'body',
        'category',
        'severity',
        'source',
        'dedupe_key',
        'action_url',
        'data',
        'read_at',
        'archived_at',
    ];

    protected $casts = [
        'data' => 'array',
        'read_at' => 'datetime',
        'archived_at' => 'datetime',
    ];

    public function adminUser()
    {
        return $this->belongsTo(User::class, 'admin_user_id');
    }

    public function relatedTenant()
    {
        return $this->belongsTo(Tenant::class, 'related_tenant_id');
    }
}

