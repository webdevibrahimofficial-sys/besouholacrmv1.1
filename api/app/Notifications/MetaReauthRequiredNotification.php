<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class MetaReauthRequiredNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public function __construct(protected string $reason = 'Meta integration was updated and requires re-authentication.')
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Meta Reconnection Required')
            ->greeting('Hello ' . $notifiable->name . ',')
            ->line('Your Meta (Facebook) connection needs to be reconnected.')
            ->line($this->reason)
            ->action('Reconnect Meta', url(config('app.frontend_url', 'http://localhost:3000') . '/marketing/meta-integration'))
            ->line('Please reconnect to continue receiving leads and syncing campaigns.');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'title' => 'Meta Reconnection Required',
            'message' => $this->reason,
            'action_url' => '/marketing/meta-integration',
            'link' => '/marketing/meta-integration',
            'type' => 'warning',
        ];
    }
}
