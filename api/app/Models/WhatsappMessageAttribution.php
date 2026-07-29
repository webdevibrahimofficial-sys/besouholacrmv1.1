<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsappMessageAttribution extends TenantModel
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'channel_id',
        'whatsapp_message_id',
        'lead_id',
        'ctwa_clid',
        'source_id',
        'source_type',
        'source_url',
        'headline',
        'ad_name',
        'campaign_name',
        'campaign_meta_id',
        'referral_raw',
    ];

    protected $casts = [
        'referral_raw' => 'array',
    ];

    public function channel(): BelongsTo
    {
        return $this->belongsTo(WhatsappChannel::class, 'channel_id');
    }

    public function message(): BelongsTo
    {
        return $this->belongsTo(WhatsappMessage::class, 'whatsapp_message_id');
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }
}
