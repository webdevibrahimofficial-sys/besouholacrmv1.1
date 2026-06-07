<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WebsiteIntakeLog extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    protected $casts = [
        'payload' => 'array',
        'created_at' => 'datetime',
    ];

    public function connection()
    {
        return $this->belongsTo(WebsiteConnection::class, 'website_connection_id');
    }

    public function lead()
    {
        return $this->belongsTo(Lead::class, 'lead_id');
    }
}
