<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ItemAddon extends Model
{
    protected $guarded = [];

    protected $casts = [
        'quantity' => 'integer',
        'price' => 'decimal:2',
    ];

    public function item()
    {
        return $this->belongsTo(Item::class);
    }
}
