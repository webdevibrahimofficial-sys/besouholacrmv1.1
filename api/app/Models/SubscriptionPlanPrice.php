<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionPlanPrice extends Model
{
    protected $fillable = [
        'subscription_plan_id',
        'currency',
        'billing_cycle',
        'list_price',
        'is_active',
    ];

    protected $casts = [
        'list_price' => 'decimal:2',
        'is_active' => 'boolean',
    ];

    public function subscriptionPlan()
    {
        return $this->belongsTo(SubscriptionPlan::class);
    }
}
