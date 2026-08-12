<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiCopilotNotification extends Model
{
    protected $table = 'ai_copilot_notifications';

    protected $fillable = [
        'tenant_id',
        'user_id',
        'type',
        'lead_id',
        'time_bucket',
        'severity',
        'title',
        'preview',
        'payload',
        'conversation_id',
        'read_at',
        'dismissed_at',
        'first_opened_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'read_at' => 'datetime',
        'dismissed_at' => 'datetime',
        'first_opened_at' => 'datetime',
    ];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(AiCopilotConversation::class, 'conversation_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
