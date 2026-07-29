<?php

namespace App\Notifications;

use App\Notifications\Concerns\ResolvesLeadNotificationContext;
use App\Traits\ChecksNotificationSettings;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Notifications\Messages\BroadcastMessage;
use Illuminate\Notifications\Notification;

class LeadDelayed extends Notification implements ShouldBroadcast
{
    use Queueable, ChecksNotificationSettings, ResolvesLeadNotificationContext;

    public $lead;
    public $action;

    public function __construct($lead, $action)
    {
        $this->lead = $lead;
        $this->action = $action;
    }

    public function via($notifiable)
    {
        return $this->withWebPushIfConfigured(['database', 'broadcast']);
    }

    protected function notificationPreferenceContext(): ?array
    {
        $context = $this->resolveLeadNotificationContext($this->lead, $this->action->id);

        return [
            'module_key' => $context['module_key'],
            'notification_key' => 'notify_delay_leads',
        ];
    }

    public function toBroadcast($notifiable): BroadcastMessage
    {
        return new BroadcastMessage($this->toArray($notifiable));
    }

    public function toArray($notifiable)
    {
        $details = $this->action->details;
        if (!is_array($details)) {
            $details = json_decode($details, true) ?? [];
        }

        $context = $this->resolveLeadNotificationContext($this->lead, $this->action->id);
        $title = $context['is_telesales'] ? 'Telesales Action Delayed' : 'Lead Action Delayed';
        $message = $context['is_telesales']
            ? "Telesales action '{$this->action->action_type}' for lead '{$this->lead->name}' is delayed."
            : "Action '{$this->action->action_type}' for lead '{$this->lead->name}' is delayed.";

        return [
            'title' => $title,
            'lead_id' => $this->lead->id,
            'lead_name' => $this->lead->name,
            'action_id' => $this->action->id,
            'action_type' => $this->action->action_type,
            'workflow_key' => $context['workflow_key'],
            'module' => $context['module_key'],
            'screen' => $context['screen'],
            'due_date' => $details['date'] ?? null,
            'message' => $message,
            'link' => $context['link'],
        ];
    }
}
