<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TenantSubscriptionContract extends LandlordModel
{
    protected $fillable = [
        'tenant_id',
        'plan_code',
        'currency',
        'billing_cycle',
        'agreed_amount',
        'effective_from',
        'effective_to',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'agreed_amount' => 'decimal:2',
        'effective_from' => 'date',
        'effective_to' => 'date',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function transactions()
    {
        return $this->hasMany(SubscriptionTransaction::class, 'contract_id');
    }
}
