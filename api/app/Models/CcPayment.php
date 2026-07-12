<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CcPayment extends TenantModel
{
    use HasFactory;

    protected $table = 'cc_payments';

    protected $fillable = [
        'tenant_id',
        'customer_id',
        'contract_id',
        'amount',
        'payment_method',
        'payment_date',
        'reference_number',
        'status',
        'notes',
        'meta_data',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'date',
        'meta_data' => 'array',
    ];

    public function contract()
    {
        return $this->belongsTo(CcContract::class, 'contract_id');
    }

    public function customer()
    {
        return $this->belongsTo(CcCustomer::class, 'customer_id');
    }

    public function allocations()
    {
        return $this->hasMany(CcPaymentAllocation::class, 'payment_id');
    }
}
