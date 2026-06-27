<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WebsiteSetting extends Model
{
    use HasFactory, BelongsToTenant;

    protected $guarded = ['id', 'created_at', 'updated_at'];

    protected $casts = [
        'social_links' => 'array',
        'contact_page_content' => 'array',
        'nav_links' => 'array',
        'footer_sections' => 'array',
        'footer_quick_links' => 'array',
        'whatsapp_float' => 'array',
        'pages_seo' => 'array',
        'is_published' => 'boolean',
    ];
}
