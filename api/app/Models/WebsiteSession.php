<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WebsiteSession extends Model
{
    use HasFactory, BelongsToTenant;

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'started_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'page_views_count' => 'integer',
        'events_count' => 'integer',
    ];

    public function events(): HasMany
    {
        return $this->hasMany(WebsiteEvent::class);
    }

    public function pageViews(): HasMany
    {
        return $this->hasMany(WebsitePageView::class);
    }
}
