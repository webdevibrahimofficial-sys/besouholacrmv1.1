<?php

namespace App\Notifications;

use App\Models\Lead;
use App\Notifications\Concerns\ResolvesLeadNotificationContext;
use App\Traits\ChecksNotificationSettings;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Notifications\Notification;

class LeadAssigned extends Notification implements ShouldBroadcast
{
    use Queueable, ChecksNotificationSettings, ResolvesLeadNotificationContext;

    public $lead;
    public $assignerName;

    public function __construct(Lead $lead, $assignerName = 'System')
    {
        $this->lead = $lead;
        $this->assignerName = $assignerName;
    }

    public function via(object $notifiable): array
    {
        return $this->determineChannels($notifiable, ['database', 'broadcast']);
    }

    protected function notificationPreferenceContext(): ?array
    {
        $context = $this->resolveLeadNotificationContext($this->lead);

        return [
            'module_key' => $context['module_key'],
            'notification_key' => 'notify_assigned_leads',
        ];
    }

    public function toArray(object $notifiable): array
    {
        $context = $this->resolveLeadNotificationContext($this->lead);
        $title = $context['is_telesales'] ? 'Telesales Lead Assigned' : 'Lead Assigned';
        $titleAr = $context['is_telesales'] ? 'تم تعيين ليد تيليسيلز' : 'تم تعيين ليد';
        $message = $context['is_telesales']
            ? "Telesales lead '{$this->lead->name}' has been assigned to {$this->lead->assignedAgent?->name}."
            : "Lead '{$this->lead->name}' has been assigned to {$this->lead->assignedAgent?->name}.";
        $messageAr = $context['is_telesales']
            ? "تم تعيين ليد التيليسيلز '{$this->lead->name}' إلى {$this->lead->assignedAgent?->name}."
            : "تم تعيين الليد '{$this->lead->name}' إلى {$this->lead->assignedAgent?->name}.";

        return [
            'lead_id' => $this->lead->id,
            'lead_name' => $this->lead->name,
            'assigned_by' => $this->assignerName,
            'assigned_to_id' => $this->lead->assigned_to,
            'assigned_to_name' => $this->lead->assignedAgent?->name,
            'workflow_key' => $context['workflow_key'],
            'module' => $context['module_key'],
            'screen' => $context['screen'],
            'title' => $title,
            'title_ar' => $titleAr,
            'message' => $message,
            'message_ar' => $messageAr,
            'link' => $context['link'],
        ];
    }
}
