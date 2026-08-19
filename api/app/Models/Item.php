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
        'tax_rate' => 'decimal:2',
        'tax_included' => 'boolean',
        'renewal_required' => 'boolean',
        'service_start_date' => 'date',
        'service_end_date' => 'date',
    ];

    protected $appends = [
        'addons_total_quantity',
        'addons_total_price',
        'total_price',
        'available_quantity',
        'total_quantity',
        'business_type',
        'category_type',
        'is_low_stock',
        'catalog_amount',
        'service_amount',
        'billing_kind',
        'is_recurring',
        'image_url',
    ];

    public function category()
    {
        return $this->belongsTo(ItemCategory::class, 'category_id');
    }

    public function categoryRecord(): ?ItemCategory
    {
        $related = $this->relationLoaded('category') ? $this->getRelation('category') : null;
        if ($related instanceof ItemCategory) {
            return $related;
        }

        if ($this->category_id) {
            return $this->category()->first();
        }

        return null;
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

    public function getBusinessTypeAttribute(): string
    {
        $meta = is_array($this->meta_data) ? $this->meta_data : [];
        $fromMeta = strtolower(trim((string) ($meta['general_inventory']['business_type'] ?? '')));
        if (in_array($fromMeta, ['product', 'service'], true)) {
            return $fromMeta;
        }

        $appliesTo = strtolower(trim((string) ($this->categoryRecord()?->applies_to ?? $this->type ?? '')));

        return in_array($appliesTo, ['service', 'services', 'subscription', 'package'], true)
            ? 'service'
            : 'product';
    }

    public function getCategoryTypeAttribute(): string
    {
        return $this->business_type === 'service' ? 'Services' : 'Products';
    }

    public function getIsLowStockAttribute(): bool
    {
        if ($this->business_type !== 'product') {
            return false;
        }

        $minimum = (int) ($this->min_alert ?? 0);
        if ($minimum <= 0) {
            return false;
        }

        return (int) ($this->quantity ?? 0) <= $minimum;
    }

    public function getCatalogAmountAttribute(): float
    {
        return (float) ($this->price ?? 0);
    }

    public function getServiceAmountAttribute(): ?float
    {
        return $this->business_type === 'service' ? $this->catalog_amount : null;
    }

    public function getBillingKindAttribute(): ?string
    {
        if ($this->business_type !== 'service') {
            return null;
        }

        $billing = strtolower(trim((string) ($this->billing_cycle ?? '')));

        return in_array($billing, ['one-time', 'onetime', 'one time', 'fixed'], true)
            ? 'non_recurring'
            : 'recurring';
    }

    public function getIsRecurringAttribute(): bool
    {
        return $this->billing_kind === 'recurring';
    }

    public function getImageUrlAttribute(): ?string
    {
        $path = trim((string) ($this->attributes['image'] ?? ''));
        if ($path === '') {
            $meta = is_array($this->meta_data) ? $this->meta_data : [];
            $path = trim((string) ($meta['general_inventory']['image'] ?? $meta['image'] ?? ''));
        }

        if ($path === '') {
            return null;
        }

        if (
            str_starts_with($path, 'http://')
            || str_starts_with($path, 'https://')
            || str_starts_with($path, 'data:')
        ) {
            return $path;
        }

        $path = ltrim($path, '/');
        if (str_starts_with($path, 'storage/')) {
            $path = substr($path, strlen('storage/'));
        }
        if (str_starts_with($path, 'api/public-files/')) {
            $path = substr($path, strlen('api/public-files/'));
        }
        $path = ltrim($path, '/');

        return $path === '' ? null : '/api/public-files/'.$path;
    }
}
