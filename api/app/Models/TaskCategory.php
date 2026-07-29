<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskCategory extends Model
{
    protected $connection = 'landlord';

    protected $fillable = [
        'code',
        'name',
        'description',
        'display_order',
        'is_active',
    ];

    protected $casts = [
        'display_order' => 'integer',
        'is_active' => 'boolean',
    ];
}
