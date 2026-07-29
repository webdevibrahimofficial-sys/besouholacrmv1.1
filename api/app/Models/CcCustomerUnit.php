<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CcCustomerUnit extends TenantModel
{
    use HasFactory;

    protected $table = 'cc_customer_units';

    protected $fillable = [
        'tenant_id',
        'customer_id',
        'property_id',
        'status',
        'reserved_at',
        'contracted_at',
        'meta_data',
    ];

    protected $casts = [
        'reserved_at' => 'datetime',
        'contracted_at' => 'datetime',
        'meta_data' => 'array',
    ];

    public function customer()
    {
        return $this->belongsTo(CcCustomer::class, 'customer_id');
    }

    public function property()
    {
        return $this->belongsTo(Property::class, 'property_id');
    }

    public function paymentPlanVersions()
    {
        return $this->hasMany(CcPaymentPlanVersion::class, 'customer_unit_id');
    }

    public function activePaymentPlan()
    {
        return $this->hasOne(CcPaymentPlanVersion::class, 'customer_unit_id')->where('is_active', true);
    }
}
