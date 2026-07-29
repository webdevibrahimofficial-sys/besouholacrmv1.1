<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WhatsappGroupContact extends TenantModel
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'group_jid',
        'group_name',
        'participant_jid',
        'lid',
        'phone',
        'resolved_phone',
        'is_unresolved_lid',
        'push_name',
        'status',
        'group_action_status',
        'group_action_reason',
        'group_action_message',
        'last_target_group_jid',
        'last_target_group_name',
        'last_add_attempt_at',
        'invite_sent_at',
        'invite_link',
        'converted_lead_id',
        'first_seen_at',
        'last_synced_at',
        'meta_data',
    ];

    protected $casts = [
        'first_seen_at' => 'datetime',
        'last_synced_at' => 'datetime',
        'last_add_attempt_at' => 'datetime',
        'invite_sent_at' => 'datetime',
        'is_unresolved_lid' => 'boolean',
        'meta_data' => 'array',
    ];

    public function convertedLead()
    {
        return $this->belongsTo(Lead::class, 'converted_lead_id');
    }
}
