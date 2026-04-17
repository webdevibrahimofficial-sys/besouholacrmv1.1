<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CcPaymentPlanVersion extends Model
{
    use HasFactory;

    protected $table = 'cc_payment_plan_versions';

    protected $fillable = [
        'tenant_id',
        'customer_unit_id',
        'version',
        'is_active',
        'reservation_amount',
        'down_payment',
        'delivery_payment',
        'installment_type',
        'installment_count',
        'installment_value',
        'meta_data',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'reservation_amount' => 'decimal:2',
        'down_payment' => 'decimal:2',
        'delivery_payment' => 'decimal:2',
        'installment_value' => 'decimal:2',
        'meta_data' => 'array',
    ];

    public function customerUnit()
    {
        return $this->belongsTo(CcCustomerUnit::class, 'customer_unit_id');
    }
}

