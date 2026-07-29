<?php

namespace App\Notifications;

use App\Models\LeadAction;
use App\Models\User;
use App\Notifications\Concerns\ResolvesLeadNotificationContext;
use App\Traits\ChecksNotificationSettings;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class LeadActionCommentNotification extends Notification
{
    use Queueable, ChecksNotificationSettings, ResolvesLeadNotificationContext;

    public $action;
    public $commenter;
    public $commentContent;

    public function __construct(LeadAction $action, User $commenter, string $commentContent)
    {
        $this->action = $action;
        $this->commenter = $commenter;
        $this->commentContent = $commentContent;
    }

    public function via($notifiable): array
    {
        if (method_exists($this, 'determineChannels')) {
            return $this->determineChannels($notifiable, ['database', 'broadcast']);
        }

        return ['database', 'broadcast'];
    }

    protected function notificationPreferenceContext(): ?array
    {
        $context = $this->resolveLeadNotificationContext($this->action->lead, $this->action->id);

        return [
            'module_key' => $context['module_key'],
            'notification_key' => $context['is_telesales'] ? 'telesales_new_comment' : 'add_action',
        ];
    }

    public function toArray($notifiable): array
    {
        $leadName = $this->action->lead->name ?? 'Unknown Lead';
        $actionType = $this->action->action_type ?? 'Action';
        $commenterName = $this->commenter->name ?? 'Unknown User';
        $context = $this->resolveLeadNotificationContext($this->action->lead, $this->action->id);

        $preview = strlen($this->commentContent) > 50
            ? substr($this->commentContent, 0, 47) . '...'
            : $this->commentContent;

        $message = "{$commenterName} commented on {$actionType} for {$leadName}: \"{$preview}\"";
        $isMyAction = $this->action->user_id == $notifiable->id;

        $comments = $this->action->details['comments'] ?? [];
        if (!is_array($comments)) {
            $comments = json_decode($comments, true) ?? [];
        }

        $count = count($comments);
        $previousComment = $count >= 2 ? $comments[$count - 2] : null;

        if ($previousComment && isset($previousComment['userId']) && $previousComment['userId'] == $notifiable->id) {
            $message = "{$commenterName} replied to your comment on {$actionType} for {$leadName}: \"{$preview}\"";
        } elseif ($isMyAction) {
            $message = "{$commenterName} commented on your {$actionType} for {$leadName}: \"{$preview}\"";
        }

        $messageAr = "{$commenterName} علّق على {$actionType} لليد {$leadName}: \"{$preview}\"";
        if ($previousComment && isset($previousComment['userId']) && $previousComment['userId'] == $notifiable->id) {
            $messageAr = "{$commenterName} ردّ على تعليقك على {$actionType} لليد {$leadName}: \"{$preview}\"";
        } elseif ($isMyAction) {
            $messageAr = "{$commenterName} علّق على {$actionType} الخاص بك لليد {$leadName}: \"{$preview}\"";
        }

        return [
            'action_id' => $this->action->id,
            'lead_id' => $this->action->lead_id,
            'lead_name' => $leadName,
            'type' => 'comment',
            'workflow_key' => $context['workflow_key'],
            'module' => $context['module_key'],
            'screen' => $context['screen'],
            'title' => $context['is_telesales'] ? "New Telesales Comment on {$actionType}" : "New Comment on {$actionType}",
            'title_ar' => "تعليق جديد على {$actionType}",
            'message' => $message,
            'message_ar' => $messageAr,
            'comment_content' => $this->commentContent,
            'commenter_name' => $commenterName,
            'commenter_id' => $this->commenter->id,
            'link' => $context['link'],
        ];
    }
}
