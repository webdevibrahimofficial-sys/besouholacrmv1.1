<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToTenant;

class ItemStockMovement extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id'];

    protected $casts = [
        'quantity' => 'integer',
        'meta' => 'array',
    ];

    public function item()
    {
        return $this->belongsTo(Item::class);
    }
}
