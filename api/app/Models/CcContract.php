<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CcContract extends TenantModel
{
    use HasFactory;

    protected $table = 'cc_contracts';

    protected $fillable = [
        'tenant_id',
        'customer_id',
        'customer_unit_id',
        'property_id',
        'contract_number',
        'contract_date',
        'first_due_date',
        'total_price',
        'payment_plan_snapshot',
        'status',
        'meta_data',
    ];

    protected $casts = [
        'contract_date' => 'date',
        'first_due_date' => 'date',
        'total_price' => 'decimal:2',
        'payment_plan_snapshot' => 'array',
        'meta_data' => 'array',
    ];

    public function customer()
    {
        return $this->belongsTo(CcCustomer::class, 'customer_id');
    }

    public function customerUnit()
    {
        return $this->belongsTo(CcCustomerUnit::class, 'customer_unit_id');
    }

    public function property()
    {
        return $this->belongsTo(Property::class, 'property_id');
    }

    public function installments()
    {
        return $this->hasMany(CcInstallment::class, 'contract_id');
    }

    public function payments()
    {
        return $this->hasMany(CcPayment::class, 'contract_id');
    }
}
