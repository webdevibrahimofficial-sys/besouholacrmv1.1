<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiCopilotMessage extends Model
{
    protected $table = 'ai_copilot_messages';

    protected $fillable = [
        'conversation_id',
        'role',
        'content',
        'tool_name',
        'tool_payload',
        'ui_actions',
    ];

    protected $casts = [
        'tool_payload' => 'array',
        'ui_actions' => 'array',
    ];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(AiCopilotConversation::class, 'conversation_id');
    }
}
