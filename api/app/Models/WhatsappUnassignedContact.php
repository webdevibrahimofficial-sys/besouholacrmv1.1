<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WhatsappUnassignedContact extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'phone',
        'push_name',
        'first_message_at',
        'last_message_at',
        'last_message_body',
        'messages_count',
        'status',
        'converted_lead_id',
    ];

    protected $casts = [
        'first_message_at' => 'datetime',
        'last_message_at' => 'datetime',
        'messages_count' => 'integer',
    ];

    public function convertedLead()
    {
        return $this->belongsTo(Lead::class, 'converted_lead_id');
    }
}
