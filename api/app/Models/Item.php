<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToTenant;

class Item extends Model
{
    // use BelongsToTenant;

    protected $guarded = [];

    protected $casts = [
        'meta_data' => 'array',
        'price' => 'decimal:2',
        'quantity' => 'integer',
        'reserved_quantity' => 'integer',
        'sold_quantity' => 'integer',
        'min_alert' => 'integer',
    ];

    protected $appends = [
        'addons_total_quantity',
        'addons_total_price',
        'total_price',
        'available_quantity',
        'total_quantity',
    ];

    public function category()
    {
        return $this->belongsTo(ItemCategory::class, 'category_id');
    }

    public function customFieldValues()
    {
        return $this->hasMany(FieldValue::class, 'record_id');
    }

    public function addons()
    {
        return $this->hasMany(ItemAddon::class);
    }

    public function getAddonsTotalQuantityAttribute(): int
    {
        return (int) $this->addons->sum(fn ($addon) => (int) ($addon->quantity ?? 0));
    }

    public function getAddonsTotalPriceAttribute(): float
    {
        return (float) $this->addons->sum(function ($addon) {
            return ((float) ($addon->price ?? 0)) * ((int) ($addon->quantity ?? 0));
        });
    }

    public function getTotalPriceAttribute(): float
    {
        return (float) ($this->price ?? 0) + $this->addons_total_price;
    }

    public function getAvailableQuantityAttribute(): int
    {
        return max(0, (int) ($this->quantity ?? 0));
    }

    public function getTotalQuantityAttribute(): int
    {
        return max(0, (int) ($this->quantity ?? 0))
            + max(0, (int) ($this->reserved_quantity ?? 0))
            + max(0, (int) ($this->sold_quantity ?? 0));
    }
}
