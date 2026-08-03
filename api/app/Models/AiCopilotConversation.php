<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AiCopilotConversation extends Model
{
    protected $table = 'ai_copilot_conversations';

    protected $fillable = [
        'tenant_id',
        'user_id',
        'title',
        'last_message_at',
    ];

    protected $casts = [
        'last_message_at' => 'datetime',
    ];

    public function messages(): HasMany
    {
        return $this->hasMany(AiCopilotMessage::class, 'conversation_id');
    }
}
