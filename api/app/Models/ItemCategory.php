<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToTenant;

class ItemCategory extends Model
{
    use HasFactory, BelongsToTenant;

    protected $guarded = ['id'];

    protected $casts = [
        'meta_data' => 'array',
    ];

    protected $appends = [
        'business_type',
        'category_type',
    ];

    public function items()
    {
        return $this->hasMany(Item::class, 'category_id');
    }

    public function getCategoryTypeAttribute(): string
    {
        $appliesTo = strtolower(trim((string) ($this->applies_to ?? '')));

        return in_array($appliesTo, ['service', 'services', 'subscription', 'package'], true)
            ? 'Services'
            : 'Products';
    }

    public function getBusinessTypeAttribute(): string
    {
        return $this->category_type === 'Services' ? 'service' : 'product';
    }
}
