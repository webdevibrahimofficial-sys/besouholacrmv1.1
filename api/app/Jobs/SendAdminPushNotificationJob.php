<?php

namespace App\Jobs;

use App\Models\AdminNotification;
use App\Models\AdminPushSubscription;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Spatie\Multitenancy\Jobs\NotTenantAware;

class SendAdminPushNotificationJob implements ShouldQueue, NotTenantAware
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
        if (! config('webpush.vapid.public_key') || ! config('webpush.vapid.subject')) {
            return;
        }

        $notification = AdminNotification::query()->find($this->adminNotificationId);
        if (! $notification) {
            return;
        }

        $subscriptions = AdminPushSubscription::query()
            ->where('admin_user_id', $notification->admin_user_id)
            ->whereNull('revoked_at')
            ->get();

        if ($subscriptions->isEmpty()) {
            return;
        }

        try {
            $webPush = new WebPush([
                'VAPID' => [
                    'subject' => config('webpush.vapid.subject'),
                    'publicKey' => config('webpush.vapid.public_key'),
                    'privateKey' => config('webpush.vapid.private_key'),
                ],
            ]);

            $payload = json_encode([
                'title' => $notification->title,
                'body' => $notification->body,
                'url' => $notification->action_url ?: '/system/notifications',
                'severity' => $notification->severity,
                'category' => $notification->category,
                'notification_id' => $notification->id,
            ]);

            foreach ($subscriptions as $subscription) {
                $webPush->queueNotification(
                    Subscription::create([
                        'endpoint' => $subscription->endpoint,
                        'keys' => [
                            'p256dh' => $subscription->public_key,
                            'auth' => $subscription->auth_token,
                        ],
                    ]),
                    $payload
                );
            }

            foreach ($webPush->flush() as $report) {
                if (! $report->isSuccess()) {
                    Log::warning('Admin push notification failed', [
                        'admin_notification_id' => $notification->id,
                        'reason' => $report->getReason(),
                    ]);
                }
            }

            AdminPushSubscription::query()
                ->where('admin_user_id', $notification->admin_user_id)
                ->whereNull('revoked_at')
                ->update(['last_used_at' => now()]);
        } catch (\Throwable $e) {
            Log::warning('Admin push dispatch exception', [
                'admin_notification_id' => $notification->id,
                'error' => $e->getMessage(),
            ]);
        }
    }
}

