<?php

namespace App\Models;

use App\Casts\EncryptCast;
use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToTenant;

class MetaIntegration extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'ad_account_id',
        'pixel_id',
        'page_id',
        'page_access_token',
        'user_access_token',
        'long_lived_token',
        'token_expires_at',
        'settings',
    ];

    protected $casts = [
        'page_access_token' => EncryptCast::class,
        'user_access_token' => EncryptCast::class,
        'long_lived_token' => EncryptCast::class,
        'token_expires_at' => 'datetime',
        'settings' => 'array',
    ];

    protected $hidden = [
        'page_access_token',
        'user_access_token',
        'long_lived_token',
    ];
}
