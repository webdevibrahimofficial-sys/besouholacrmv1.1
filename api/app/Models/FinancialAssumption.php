<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class FinancialAssumption extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'discount_rate',
        'day_count_convention',
        'compounding_frequency',
        'rounding_rule',
        'is_explicitly_configured',
        'configured_at',
        'configured_by_id',
    ];

    protected $casts = [
        'discount_rate' => 'decimal:4',
        'is_explicitly_configured' => 'boolean',
        'configured_at' => 'datetime',
    ];
}
