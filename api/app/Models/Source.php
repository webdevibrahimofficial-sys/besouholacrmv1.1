<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToTenant;

class Source extends Model
{
    use BelongsToTenant;

    protected $fillable = ['tenant_id', 'name', 'name_ar', 'is_active', 'meta_data'];

    protected $casts = [
        'meta_data' => 'array',
    ];
}
