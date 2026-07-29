<?php

namespace App\Jobs;

use App\Models\SystemError;
use App\Models\User;
use App\Data\AdminNotificationPayload;
use App\Notifications\SystemNotification;
use App\Services\AdminNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Spatie\Multitenancy\Jobs\NotTenantAware;

class NotifySystemErrorCreated implements ShouldQueue, NotTenantAware
{
    use Queueable;

    public int $tries = 2;

    public function __construct(
        public int $systemErrorId
    ) {
        $this->onConnection(config('queue.default', 'sync'));
        $this->onQueue('default');
    }

    public function handle(): void
    {
        try {
            $error = SystemError::withoutGlobalScopes()
                ->with('tenant')
                ->find($this->systemErrorId);

            if (! $error) {
                return;
            }

            $tenantName = $error->tenant?->name ?? 'System';
            $title = "Critical system error: {$tenantName}";
            $message = "New error ({$error->status}) in {$error->service}: " . Str::limit($error->message, 100);

            $superAdmins = User::withoutGlobalScopes()
                ->where('is_super_admin', true)
                ->get();

            if (config('features.admin_notifications_v1')) {
                app(AdminNotificationService::class)->notify(
                    new AdminNotificationPayload(
                        type: 'system_error',
                        title: $title,
                        body: $message,
                        category: 'system',
                        severity: in_array(strtolower((string) $error->level), ['critical', 'error'], true) ? 'critical' : 'warning',
                        source: (string) ($error->service ?? 'system'),
                        relatedTenantId: $error->tenant_id ? (int) $error->tenant_id : null,
                        data: [
                            'system_error_id' => $error->id,
                            'tenant_id' => $error->tenant_id,
                            'status' => $error->status,
                            'level' => $error->level,
                            'service' => $error->service,
                        ],
                        actionUrl: '/system/error-log',
                        channels: ['in_app', 'email', 'push'],
                        dedupeKey: sprintf(
                            'system_error:%s:%s:%s',
                            (string) ($error->tenant_id ?? 'none'),
                            (string) ($error->service ?? 'unknown'),
                            (string) ($error->status ?? 'new')
                        ),
                    ),
                    $superAdmins
                );
                return;
            }

            foreach ($superAdmins as $admin) {
                try {
                    $admin->notify(new SystemNotification($title, $message, [
                        'type' => 'system_error',
                        'system_error_id' => $error->id,
                        'tenant_id' => $error->tenant_id,
                        'status' => $error->status,
                        'level' => $error->level,
                        'service' => $error->service,
                    ]));
                } catch (\Throwable $e) {
                    Log::warning('Failed to notify super admin about system error', [
                        'admin_id' => $admin->id,
                        'error_id' => $this->systemErrorId,
                        'exception' => $e->getMessage(),
                    ]);
                }
            }
        } catch (\Throwable $exception) {
            Log::error('NotifySystemErrorCreated job failed', [
                'system_error_id' => $this->systemErrorId,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    public function failed(\Throwable $exception): void
    {
        Log::error('NotifySystemErrorCreated job failed permanently', [
            'system_error_id' => $this->systemErrorId,
            'message' => $exception->getMessage(),
        ]);
    }
}
