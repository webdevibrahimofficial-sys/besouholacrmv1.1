<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WebsiteEvent extends Model
{
    use HasFactory, BelongsToTenant;

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'meta' => 'array',
        'occurred_at' => 'datetime',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(WebsiteSession::class, 'website_session_id');
    }
}
