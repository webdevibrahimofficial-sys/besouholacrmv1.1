<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Spatie\Multitenancy\Models\Concerns\UsesLandlordConnection;

class MetaDataDeletionRequest extends Model
{
    use UsesLandlordConnection;

    protected $fillable = [
        'fb_user_id',
        'confirmation_code',
        'status',
        'connections_deleted',
        'pages_deleted',
        'payload',
        'completed_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'connections_deleted' => 'integer',
        'pages_deleted' => 'integer',
        'completed_at' => 'datetime',
    ];
}
