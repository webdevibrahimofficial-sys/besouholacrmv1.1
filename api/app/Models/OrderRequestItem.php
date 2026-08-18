<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class OrderRequestItem extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id'];

    protected $casts = [
        'quantity' => 'decimal:2',
        'unit_price' => 'decimal:2',
        'line_subtotal' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'line_total' => 'decimal:2',
        'meta_data' => 'array',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function item()
    {
        return $this->belongsTo(Item::class);
    }

    public function category()
    {
        return $this->belongsTo(ItemCategory::class, 'category_id');
    }
}
