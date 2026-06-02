<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class TenantMetaApp extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'app_id',
        'app_secret',
        'verify_token',
        'webhook_key',
        'is_active',
    ];

    protected $casts = [
        'app_secret' => 'encrypted',
        'verify_token' => 'encrypted',
        'is_active' => 'boolean',
    ];

    protected $hidden = [
        'app_secret',
        'verify_token',
    ];

    public function getMaskedAppSecretAttribute(): ?string
    {
        if (!$this->app_secret) {
            return null;
        }

        $len = strlen((string) $this->app_secret);
        if ($len <= 6) {
            return str_repeat('*', $len);
        }

        return substr($this->app_secret, 0, 2) . str_repeat('*', $len - 4) . substr($this->app_secret, -2);
    }
}
