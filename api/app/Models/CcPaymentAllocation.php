<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CcPaymentAllocation extends TenantModel
{
    use HasFactory;

    protected $table = 'cc_payment_allocations';

    protected $fillable = [
        'tenant_id',
        'payment_id',
        'installment_id',
        'amount_applied',
        'meta_data',
    ];

    protected $casts = [
        'amount_applied' => 'decimal:2',
        'meta_data' => 'array',
    ];

    public function payment()
    {
        return $this->belongsTo(CcPayment::class, 'payment_id');
    }

    public function installment()
    {
        return $this->belongsTo(CcInstallment::class, 'installment_id');
    }
}
