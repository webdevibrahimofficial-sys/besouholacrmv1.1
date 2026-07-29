<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WhatsappMessage extends TenantModel
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'channel_id',
        'provider',
        'source',
        'phone_number_id',
        'from',
        'to',
        'type',
        'direction',
        'status',
        'conversation_id',
        'message_id',
        'counterpart_lid',
        'body',
        'lead_id',
        'raw',
    ];

    protected $casts = [
        'raw' => 'array',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function lead()
    {
        return $this->belongsTo(Lead::class);
    }

    public function channel()
    {
        return $this->belongsTo(WhatsappChannel::class, 'channel_id');
    }

    public function attribution()
    {
        return $this->hasOne(WhatsappMessageAttribution::class, 'whatsapp_message_id');
    }
}
