<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WhatsappGroupContact extends Model
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'group_jid',
        'group_name',
        'participant_jid',
        'phone',
        'push_name',
        'status',
        'converted_lead_id',
        'first_seen_at',
        'last_synced_at',
    ];

    protected $casts = [
        'first_seen_at' => 'datetime',
        'last_synced_at' => 'datetime',
    ];

    public function convertedLead()
    {
        return $this->belongsTo(Lead::class, 'converted_lead_id');
    }
}
