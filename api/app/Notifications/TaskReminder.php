<?php

namespace App\Notifications;

use App\Traits\ChecksNotificationSettings;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Notifications\Notification;

class TaskReminder extends Notification implements ShouldBroadcast
{
    use Queueable, ChecksNotificationSettings;

    public function __construct(
        public $task,
        public string $reminderBefore = 'upcoming'
    ) {
    }

    public function via(object $notifiable): array
    {
        return $this->determineChannels($notifiable, ['database', 'broadcast']);
    }

    public function toArray(object $notifiable): array
    {
        return [
            'task_id' => $this->task->id,
            'title' => $this->task->title,
            'due_date' => $this->task->due_date,
            'message' => "Reminder: task '{$this->task->title}' is due in {$this->reminderBefore}.",
            'link' => "/tasks/{$this->task->id}",
            'type' => 'task_reminder',
        ];
    }
}
