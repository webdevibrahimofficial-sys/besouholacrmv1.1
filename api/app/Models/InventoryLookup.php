<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToTenant;

class InventoryLookup extends Model
{
    use BelongsToTenant;

    public const TYPE_SERVICE_TYPE = 'service_type';

    protected $guarded = ['id'];

    protected $casts = [
        'is_active' => 'boolean',
        'sort_order' => 'integer',
    ];
}
