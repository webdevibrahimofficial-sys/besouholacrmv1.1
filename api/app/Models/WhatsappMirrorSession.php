<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsappMirrorSession extends Model
{
    protected $fillable = [
        'tenant_id',
        'status',
        'connected_phone_number',
        'last_connected_at',
        'last_disconnected_at',
    ];

    protected $casts = [
        'last_connected_at' => 'datetime',
        'last_disconnected_at' => 'datetime',
    ];

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
