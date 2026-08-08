<?php

namespace App\Models;

use App\Casts\EncryptCast;
use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class TenantMetaApp extends Model
{
    use BelongsToTenant;

    public const MODE_SHARED = 'shared';
    public const MODE_CUSTOM = 'custom';

    protected $fillable = [
        'tenant_id',
        'mode',
        'app_id',
        'app_secret',
        'verify_token',
        'webhook_key',
        'is_active',
    ];

    protected $casts = [
        'app_secret' => EncryptCast::class,
        'is_active' => 'boolean',
    ];

    protected $hidden = [
        'app_secret',
    ];

    public function isCustomMode(): bool
    {
        return $this->mode === self::MODE_CUSTOM && $this->is_active;
    }

    public function hasCompleteCustomCredentials(): bool
    {
        return filled($this->app_id) && filled($this->app_secret);
    }
}
