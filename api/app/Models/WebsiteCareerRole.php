<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WebsiteCareerRole extends Model
{
    use HasFactory, BelongsToTenant;

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'responsibilities' => 'array',
        'requirements' => 'array',
        'benefits' => 'array',
        'is_active' => 'boolean',
        'is_featured' => 'boolean',
        'sort_order' => 'integer',
    ];
}
