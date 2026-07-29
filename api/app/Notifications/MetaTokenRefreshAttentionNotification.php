<?php

namespace App\Notifications;

use App\Models\MetaConnection;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MetaTokenRefreshAttentionNotification extends Notification
{
    use Queueable;

    public function __construct(
        protected MetaConnection $metaConnection,
        protected ?string $reason = null,
        protected ?int $daysRemaining = null
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject('Meta Token Needs Attention')
            ->greeting('Hello ' . $notifiable->name . ',')
            ->line('We could not safely refresh a Meta connection token automatically.')
            ->line('Connection: ' . ($this->metaConnection->name ?: $this->metaConnection->email ?: ('#' . $this->metaConnection->id)));

        if ($this->daysRemaining !== null) {
            $mail->line($this->daysRemaining <= 0
                ? 'This token is already expired.'
                : "This token expires in {$this->daysRemaining} day(s).");
        }

        if ($this->reason) {
            $mail->line('Reason: ' . $this->reason);
        }

        return $mail
            ->action('Reconnect Meta', url(env('FRONTEND_URL', 'http://localhost:3000') . '/marketing/meta-integration'))
            ->line('Please review the Meta integration to avoid lead sync interruptions.');
    }

    public function toArray(object $notifiable): array
    {
        $message = 'A Meta token needs attention to keep lead syncing active.';

        if ($this->daysRemaining !== null) {
            $message = $this->daysRemaining <= 0
                ? 'A Meta token has expired and needs reconnection.'
                : "A Meta token will expire in {$this->daysRemaining} day(s) and could not be refreshed automatically.";
        }

        return [
            'title' => 'Meta Token Needs Attention',
            'message' => $message,
            'connection_id' => $this->metaConnection->id,
            'connection_name' => $this->metaConnection->name,
            'connection_email' => $this->metaConnection->email,
            'expires_at' => optional($this->metaConnection->expires_at)?->toDateTimeString(),
            'days_remaining' => $this->daysRemaining,
            'reason' => $this->reason,
            'action_url' => '/marketing/meta-integration',
            'link' => '/marketing/meta-integration',
            'type' => 'warning',
        ];
    }
}
