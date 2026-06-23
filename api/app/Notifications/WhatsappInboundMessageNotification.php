<?php

namespace App\Notifications;

use App\Models\Lead;
use App\Models\WhatsappMessage;
use App\Traits\ChecksNotificationSettings;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Str;

class WhatsappInboundMessageNotification extends Notification implements ShouldBroadcast
{
    use Queueable, ChecksNotificationSettings;

    public function __construct(
        public Lead $lead,
        public WhatsappMessage $message
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->determineChannels($notifiable, ['database', 'broadcast']);
    }

    public function toArray(object $notifiable): array
    {
        $leadName = (string) ($this->lead->name ?? ('Lead #' . $this->lead->id));
        $body = trim((string) ($this->message->body ?? ''));
        $snippet = $body !== ''
            ? Str::limit(preg_replace('/\s+/', ' ', $body), 120)
            : 'Media message';

        return [
            'type' => 'whatsapp_message_received',
            'lead_id' => $this->lead->id,
            'lead_name' => $leadName,
            'whatsapp_message_id' => $this->message->id,
            'message_id' => $this->message->message_id,
            'from' => $this->message->from,
            'title' => 'New WhatsApp Message',
            'message' => "New WhatsApp message from '{$leadName}': {$snippet}",
            'body' => $snippet,
            'link' => "/leads?lead_id={$this->lead->id}",
            'screen' => 'lead_details',
            'entity_id' => (string) $this->lead->id,
        ];
    }
}
