<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WebsiteConnection extends Model
{
    use HasFactory, BelongsToTenant;

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'is_active' => 'boolean',
        'allowed_origins' => 'array',
        'allow_all_origins_for_testing' => 'boolean',
        'last_used_at' => 'datetime',
        'requests_count' => 'integer',
    ];

    protected $hidden = [
        'api_key_hash',
    ];

    protected $appends = [
        'masked_key',
    ];

    public function campaign()
    {
        return $this->belongsTo(Campaign::class, 'default_campaign_id');
    }

    public function source()
    {
        return $this->belongsTo(Source::class, 'default_source_id');
    }

    public function leads()
    {
        return $this->hasMany(Lead::class, 'website_connection_id');
    }

    public function intakeLogs()
    {
        return $this->hasMany(WebsiteIntakeLog::class, 'website_connection_id');
    }

    public function getMaskedKeyAttribute(): string
    {
        if (!$this->key_prefix) {
            return '••••••••';
        }

        return $this->key_prefix . '••••••••••••••••';
    }
}
