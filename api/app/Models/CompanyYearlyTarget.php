<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CompanyYearlyTarget extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'year',
        'yearly_target',
        'monthly_target',
        'quarterly_target',
        'semi_annual_target',
        'created_by_id',
        'updated_by_id',
    ];

    protected function casts(): array
    {
        return [
            'year' => 'integer',
            'yearly_target' => 'decimal:2',
            'monthly_target' => 'decimal:2',
            'quarterly_target' => 'decimal:2',
            'semi_annual_target' => 'decimal:2',
        ];
    }
}
