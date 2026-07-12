<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AdminPushSubscription extends LandlordModel
{
    use HasFactory;

    protected $fillable = [
        'admin_user_id',
        'endpoint',
        'endpoint_hash',
        'public_key',
        'auth_token',
        'user_agent',
        'last_used_at',
        'revoked_at',
    ];

    protected $casts = [
        'last_used_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function adminUser()
    {
        return $this->belongsTo(User::class, 'admin_user_id');
    }
}

