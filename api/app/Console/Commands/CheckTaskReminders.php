<?php

namespace App\Console\Commands;

use App\Models\Task;
use App\Models\User;
use App\Notifications\TaskReminder;
use App\Traits\ResolvesNotificationRecipients;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

class CheckTaskReminders extends Command
{
    use ResolvesNotificationRecipients;

    protected $signature = 'tasks:check-reminders';

    protected $description = 'Check for task reminders and notify assignees';

    public function handle(): int
    {
        $tasks = Task::query()
            ->whereNotNull('assigned_to')
            ->whereNotNull('due_date')
            ->whereNotNull('reminder_before')
            ->whereNotIn('status', ['completed', 'expired', 'cancelled', 'CANCELLED', 'FINISHED'])
            ->get();

        $sent = 0;
        $skipped = 0;
        $today = now(config('app.timezone'))->startOfDay();

        foreach ($tasks as $task) {
            $reminderKey = $this->normalizeReminderBefore($task->reminder_before);
            if (!$reminderKey) {
                $skipped++;
                continue;
            }

            $dueDate = optional($task->due_date)?->copy()?->startOfDay();
            if (!$dueDate) {
                $skipped++;
                continue;
            }

            if (!$this->shouldSendReminderToday($today, $dueDate, $reminderKey)) {
                $skipped++;
                continue;
            }

            $cacheKey = sprintf('task-reminder:%s:%s:%s', $task->id, $reminderKey, $today->toDateString());
            if (Cache::has($cacheKey)) {
                $skipped++;
                continue;
            }

            $assignee = User::with(['manager', 'team.leader'])->find($task->assigned_to);
            if (!$assignee) {
                $skipped++;
                continue;
            }

            $creator = $task->created_by ? User::find($task->created_by) : null;
            $notification = new TaskReminder($task, $this->humanizeReminderBefore($reminderKey));
            $recipients = $this->buildNotificationRecipients(
                $assignee,
                [
                    'owner' => $creator,
                    'assignee' => $assignee,
                ],
                'tasks',
                'notify_task_assigned'
            );

            foreach ($recipients as $recipient) {
                try {
                    $recipient->notify($notification);
                } catch (\Throwable $e) {
                    report($e);
                }
            }

            Cache::put($cacheKey, true, now()->addDay());
            $sent++;
        }

        $this->info("Task reminders checked. Sent: {$sent}, Skipped: {$skipped}");

        return self::SUCCESS;
    }

    protected function normalizeReminderBefore(?string $value): ?string
    {
        $normalized = strtolower(trim((string) $value));

        return in_array($normalized, ['5m', '15m', '30m', '1h', '2h', '1d'], true)
            ? $normalized
            : null;
    }

    protected function shouldSendReminderToday($today, $dueDate, string $reminderKey): bool
    {
        if ($reminderKey === '1d') {
            return $today->equalTo($dueDate->copy()->subDay());
        }

        // Tasks currently store date-only deadlines, not exact due times.
        // For short reminder windows, the safest useful behavior is to notify once on the due date.
        return $today->equalTo($dueDate);
    }

    protected function humanizeReminderBefore(string $reminderKey): string
    {
        return match ($reminderKey) {
            '5m' => '5 minutes',
            '15m' => '15 minutes',
            '30m' => '30 minutes',
            '1h' => '1 hour',
            '2h' => '2 hours',
            '1d' => '1 day',
            default => $reminderKey,
        };
    }
}
