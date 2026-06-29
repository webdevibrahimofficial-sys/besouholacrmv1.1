<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionPlan extends Model
{
    protected $connection = 'landlord';

    protected $fillable = [
        'code',
        'name',
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
}
