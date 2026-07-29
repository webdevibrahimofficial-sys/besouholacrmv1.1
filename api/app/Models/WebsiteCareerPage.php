<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WebsiteCareerPage extends Model
{
    use HasFactory, BelongsToTenant;

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'content' => 'array',
        'is_active' => 'boolean',
    ];
}
