<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionTransactionItem extends LandlordModel
{
    protected $fillable = [
        'transaction_id',
        'item_type',
        'item_code',
        'label',
        'quantity',
        'unit_price',
        'amount',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'decimal:2',
        'amount' => 'decimal:2',
    ];

    public function transaction()
    {
        return $this->belongsTo(SubscriptionTransaction::class, 'transaction_id');
    }
}
