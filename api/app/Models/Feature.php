<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;

class Feature extends LandlordModel
{
    use HasFactory;

    protected $fillable = [
        'key',
        'name',
        'description',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function tenants()
    {
        return $this->belongsToMany(Tenant::class, 'tenant_features')
            ->withPivot(['is_enabled', 'config', 'enabled_at'])
            ->withTimestamps();
    }
}
