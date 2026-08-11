<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;

class WhatsappConversationRead extends TenantModel
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'user_id',
        'conversation_key',
        'last_read_at',
    ];

    protected $casts = [
        'last_read_at' => 'datetime',
    ];
}
