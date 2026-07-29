<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WhatsappUnassignedContact extends TenantModel
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'phone',
        'is_unresolved_lid',
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
        'is_unresolved_lid' => 'boolean',
    ];

    public function convertedLead()
    {
        return $this->belongsTo(Lead::class, 'converted_lead_id');
    }
}
