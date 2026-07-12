<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CcInstallment extends TenantModel
{
    use HasFactory;

    protected $table = 'cc_installments';

    protected $fillable = [
        'tenant_id',
        'contract_id',
        'installment_number',
        'due_date',
        'amount',
        'paid_amount',
        'status',
        'meta_data',
    ];

    protected $casts = [
        'due_date' => 'date',
        'amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'meta_data' => 'array',
    ];

    public function contract()
    {
        return $this->belongsTo(CcContract::class, 'contract_id');
    }

    public function allocations()
    {
        return $this->hasMany(CcPaymentAllocation::class, 'installment_id');
    }
}
