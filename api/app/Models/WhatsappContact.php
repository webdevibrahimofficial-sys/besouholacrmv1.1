<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * Persistent per-tenant WhatsApp contact cache ("Contact Resolver Layer").
 *
 * Populated from contacts.upsert / contacts.update events pushed by the
 * mirror service, and enriched opportunistically from message events and
 * group-contact syncs. Acts as the single source of truth for resolving a
 * WhatsApp LID (@lid) to a real phone number, independent of any single
 * group snapshot or in-memory map on the Node side.
 */
class WhatsappContact extends TenantModel
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'session_id',
        'jid',
        'lid',
        'phone',
        'name',
        'push_name',
        'verified_name',
        'raw',
        'last_seen_at',
    ];

    protected $casts = [
        'raw' => 'array',
        'last_seen_at' => 'datetime',
    ];
}
