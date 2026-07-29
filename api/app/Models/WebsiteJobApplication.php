<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class WebsiteJobApplication extends Model
{
    use BelongsToTenant;

    protected $guarded = ['id'];

    protected $casts = [
        'answers' => 'array',
        'meta_data' => 'array',
    ];

    public function connection()
    {
        return $this->belongsTo(WebsiteConnection::class, 'website_connection_id');
    }
}
