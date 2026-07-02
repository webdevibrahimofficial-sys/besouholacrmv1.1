<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionPlan extends Model
{
    protected $fillable = [
        'code',
        'name',
        'icon',
        'description',
        'modules',
        'company_type_overrides',
        'is_active',
        'display_order',
    ];

    protected $casts = [
        'modules' => 'array',
        'company_type_overrides' => 'array',
        'is_active' => 'boolean',
        'display_order' => 'integer',
    ];

    public function prices()
    {
        return $this->hasMany(SubscriptionPlanPrice::class);
    }
}
