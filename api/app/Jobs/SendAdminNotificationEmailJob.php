<?php

namespace App\Jobs;

use App\Models\AdminNotification;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Spatie\Multitenancy\Jobs\NotTenantAware;

class SendAdminNotificationEmailJob implements ShouldQueue, NotTenantAware
{
    use Queueable;

    public int $tries = 2;

    public function __construct(public string $adminNotificationId)
    {
        $this->onConnection(config('queue.default', 'sync'));
        $this->onQueue('default');
    }

    public function handle(): void
    {
        $notification = AdminNotification::query()->find($this->adminNotificationId);
        if (! $notification) {
            return;
        }

        /** @var User|null $admin */
        $admin = User::withoutGlobalScopes()->find($notification->admin_user_id);
        if (! $admin || ! $admin->is_super_admin || empty($admin->email)) {
            return;
        }

        try {
            Mail::raw(
                trim(($notification->title ?? 'Admin notification') . PHP_EOL . PHP_EOL . ($notification->body ?? '')),
                function ($message) use ($admin, $notification) {
                    $message->to($admin->email)->subject('[Admin] ' . $notification->title);
                }
            );
        } catch (\Throwable $e) {
            Log::warning('Failed to send admin notification email', [
                'admin_notification_id' => $notification->id,
                'admin_user_id' => $notification->admin_user_id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}

