<?php

namespace App\Models;

use App\Casts\EncryptCast;
use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToTenant;

class MetaConnection extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'agency_id',
        'fb_user_id',
        'user_access_token',
        'expires_at',
        'needs_reauth',
        'name',
        'email',
    ];

    protected $casts = [
        'user_access_token' => EncryptCast::class,
        'expires_at' => 'datetime',
        'needs_reauth' => 'boolean',
    ];

    protected $hidden = [
        'user_access_token',
    ];

    public function businesses()
    {
        return $this->hasMany(MetaBusiness::class, 'connection_id');
    }
}
