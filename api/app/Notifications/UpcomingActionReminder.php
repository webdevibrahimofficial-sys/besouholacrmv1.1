<?php

namespace App\Notifications;

use App\Models\LeadAction;
use App\Notifications\Concerns\ResolvesLeadNotificationContext;
use App\Traits\ChecksNotificationSettings;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class UpcomingActionReminder extends Notification
{
    use Queueable, ChecksNotificationSettings, ResolvesLeadNotificationContext;

    public $action;

    public function __construct(LeadAction $action)
    {
        $this->action = $action;
    }

    public function via(object $notifiable): array
    {
        return $this->determineChannels($notifiable, ['database']);
    }

    protected function notificationPreferenceContext(): ?array
    {
        $context = $this->resolveLeadNotificationContext($this->action->lead, $this->action->id);

        return [
            'module_key' => $context['module_key'],
            'notification_key' => $context['is_telesales'] ? 'telesales_upcoming_action' : 'add_action',
        ];
    }

    public function toArray(object $notifiable): array
    {
        $details = $this->action->details;
        if (!is_array($details)) {
            $details = json_decode($details, true) ?? [];
        }

        $date = $details['date'] ?? '';
        $time = $details['time'] ?? '';
        $dateTime = trim("{$date} {$time}");
        $context = $this->resolveLeadNotificationContext($this->action->lead, $this->action->id);
        $title = $context['is_telesales'] ? 'Upcoming Telesales Action Reminder' : 'Upcoming Action Reminder';
        $message = $context['is_telesales']
            ? "Upcoming telesales action '{$this->action->action_type}' for lead {$this->action->lead->name} at {$dateTime}"
            : "Upcoming action '{$this->action->action_type}' for lead {$this->action->lead->name} at {$dateTime}";

        return [
            'title' => $title,
            'action_id' => $this->action->id,
            'lead_id' => $this->action->lead_id,
            'lead_name' => $this->action->lead->name ?? 'Unknown Lead',
            'type' => $this->action->action_type,
            'workflow_key' => $context['workflow_key'],
            'module' => $context['module_key'],
            'screen' => $context['screen'],
            'scheduled_at' => $dateTime,
            'message' => $message,
            'link' => $context['link'],
        ];
    }
}
