<?php

namespace App\Services;

use App\Data\AdminNotificationPayload;
use App\Models\SubscriptionTransaction;
use App\Models\Tenant;
use App\Models\TenantBackup;
use Illuminate\Support\Collection;
use Throwable;

class AdminEventNotificationService
{
    public function __construct(
        private readonly AdminNotificationService $notifications
    ) {
    }

    public function notifyTenantCreated(Tenant $tenant): Collection
    {
        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'tenant_created',
            title: 'Tenant created',
            titleAr: 'تم إنشاء تينانت',
            body: "New tenant {$tenant->name} has been provisioned successfully.",
            bodyAr: "تم إنشاء التينانت {$tenant->name} بنجاح.",
            category: 'tenant',
            severity: 'success',
            source: 'tenant_management',
            relatedTenantId: $tenant->id,
            data: [
                'tenant_id' => $tenant->id,
                'tenant_name' => $tenant->name,
                'tenant_slug' => $tenant->slug,
                'status' => $tenant->status,
            ],
            actionUrl: '/system/tenants',
            channels: ['in_app'],
            dedupeKey: 'tenant_created:' . $tenant->id,
        ));
    }

    public function notifyTenantActivated(Tenant $tenant): Collection
    {
        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'tenant_activated',
            title: 'Tenant activated',
            titleAr: 'تم تفعيل التينانت',
            body: "Tenant {$tenant->name} is now active.",
            bodyAr: "التينانت {$tenant->name} أصبحت نشطة الآن.",
            category: 'tenant',
            severity: 'success',
            source: 'tenant_management',
            relatedTenantId: $tenant->id,
            data: [
                'tenant_id' => $tenant->id,
                'tenant_name' => $tenant->name,
                'status' => $tenant->status,
            ],
            actionUrl: '/system/tenants',
            channels: ['in_app'],
            dedupeKey: 'tenant_activated:' . $tenant->id . ':' . now()->toDateString(),
        ));
    }

    public function notifyTenantExpiringSoon(Tenant $tenant, int $daysLeft): Collection
    {
        $tenantName = $tenant->name ?: 'Tenant';

        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'tenant_subscription_expiring_soon',
            title: "{$tenantName} subscription expiring soon",
            titleAr: "اشتراك {$tenantName} أوشك على الانتهاء",
            body: "{$tenantName} expires in {$daysLeft} day(s).",
            bodyAr: "سينتهي اشتراك {$tenantName} خلال {$daysLeft} يوم.",
            category: 'subscription',
            severity: $daysLeft <= 3 ? 'critical' : 'warning',
            source: 'subscription',
            relatedTenantId: $tenant->id,
            data: [
                'tenant_id' => $tenant->id,
                'tenant_name' => $tenant->name,
                'days_left' => $daysLeft,
                'end_date' => optional($tenant->end_date)->toDateString(),
            ],
            actionUrl: '/system/tenants',
            channels: ['in_app'],
            dedupeKey: 'tenant_expiring:' . $tenant->id . ':' . optional($tenant->end_date)->toDateString(),
            dedupeWindowMinutes: 1440,
        ));
    }

    public function notifyBackupFailed(TenantBackup $backup, ?Tenant $tenant = null): Collection
    {
        $tenantName = $tenant?->name ?? 'Platform';

        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'backup_failed',
            title: 'Backup failed',
            titleAr: 'فشل النسخ الاحتياطي',
            body: "Backup failed for {$tenantName}. " . trim((string) $backup->error_message),
            bodyAr: "فشل النسخ الاحتياطي لـ {$tenantName}. " . trim((string) $backup->error_message),
            category: 'backup',
            severity: 'error',
            source: 'backup',
            relatedTenantId: $tenant?->id,
            data: [
                'backup_id' => $backup->id,
                'tenant_id' => $tenant?->id,
                'tenant_name' => $tenant?->name,
                'status' => $backup->status,
                'scope' => $backup->scope,
                'error_message' => $backup->error_message,
            ],
            actionUrl: '/system/backup',
            channels: ['in_app', 'email', 'push'],
            dedupeKey: 'backup_failed:' . ($tenant?->id ?? 'platform') . ':' . $backup->id,
        ));
    }

    public function notifyPaymentFailed(SubscriptionTransaction $transaction): Collection
    {
        $tenant = $transaction->tenant;
        $amount = number_format((float) $transaction->total_amount, 2);

        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'payment_failed',
            title: 'Payment failed',
            titleAr: 'فشل الدفع',
            body: "Payment failed for tenant {$tenant?->name}. Amount: {$amount} {$transaction->currency}.",
            bodyAr: "فشلت عملية الدفع للتينانت {$tenant?->name}. المبلغ: {$amount} {$transaction->currency}.",
            category: 'billing',
            severity: 'error',
            source: 'billing',
            relatedTenantId: $transaction->tenant_id,
            data: [
                'transaction_id' => $transaction->id,
                'tenant_id' => $transaction->tenant_id,
                'tenant_name' => $tenant?->name,
                'currency' => $transaction->currency,
                'total_amount' => (float) $transaction->total_amount,
                'gateway_provider' => $transaction->gateway_provider,
                'gateway_reference' => $transaction->gateway_reference,
                'status' => $transaction->status,
            ],
            actionUrl: '/system/transactions',
            channels: ['in_app', 'email'],
            dedupeKey: 'payment_failed:' . $transaction->id . ':' . $transaction->status,
        ));
    }

    public function notifyIntegrationDisconnected(int $tenantId, string $tenantName, string $provider, string $reason): Collection
    {
        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'integration_disconnected',
            title: 'Integration disconnected',
            titleAr: 'تم فصل التكامل',
            body: "{$provider} integration for {$tenantName} needs attention. {$reason}",
            bodyAr: "تكامل {$provider} الخاص بـ {$tenantName} يحتاج إلى متابعة. {$reason}",
            category: 'integration',
            severity: 'warning',
            source: strtolower($provider),
            relatedTenantId: $tenantId,
            data: [
                'tenant_id' => $tenantId,
                'tenant_name' => $tenantName,
                'provider' => $provider,
                'reason' => $reason,
            ],
            actionUrl: '/system/integrations',
            channels: ['in_app', 'email'],
            dedupeKey: 'integration_disconnected:' . $tenantId . ':' . strtolower($provider) . ':' . now()->toDateString(),
        ));
    }

    public function notifyMetaReauthRequired(int $tenantId, string $tenantName, string $reason): Collection
    {
        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'meta_reauth_required',
            title: 'Meta reconnection required',
            titleAr: 'مطلوب إعادة ربط ميتا',
            body: "{$tenantName} must reconnect Meta after the shared app migration. {$reason}",
            bodyAr: "يجب على {$tenantName} إعادة ربط ميتا بعد ترحيل التطبيق المشترك. {$reason}",
            category: 'integration',
            severity: 'warning',
            source: 'meta',
            relatedTenantId: $tenantId,
            data: [
                'tenant_id' => $tenantId,
                'tenant_name' => $tenantName,
                'provider' => 'meta',
                'reason' => $reason,
            ],
            actionUrl: '/system/integrations',
            channels: ['in_app'],
            dedupeKey: 'meta_reauth_required:' . $tenantId . ':' . now()->toDateString(),
        ));
    }

    public function notifyMetaRateLimit(string $endpoint, int $code, string $message): Collection
    {
        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'meta_rate_limit',
            title: 'Meta API rate limit reached',
            titleAr: 'تم الوصول إلى حد ميتا',
            body: "Meta API rate limit on {$endpoint} (code {$code}): {$message}",
            bodyAr: "تم الوصول إلى حد Meta API على {$endpoint} (الكود {$code}): {$message}",
            category: 'integration',
            severity: 'warning',
            source: 'meta',
            data: [
                'endpoint' => $endpoint,
                'code' => $code,
                'message' => $message,
            ],
            actionUrl: '/system/integrations',
            channels: ['in_app'],
            dedupeKey: 'meta_rate_limit:' . now()->format('Y-m-d-H-i'),
            dedupeWindowMinutes: 15,
        ));
    }

    public function notifyQueueFailure(string $jobName, string $connection, string $queue, string $message): Collection
    {
        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'queue_failure',
            title: 'Queue job failed',
            titleAr: 'فشل مهمة في قائمة الانتظار',
            body: "{$jobName} failed on {$connection}/{$queue}. " . $message,
            bodyAr: "فشلت المهمة {$jobName} على {$connection}/{$queue}. {$message}",
            category: 'queue',
            severity: 'critical',
            source: 'queue',
            data: [
                'job_name' => $jobName,
                'connection' => $connection,
                'queue' => $queue,
                'message' => $message,
            ],
            actionUrl: '/system/error-log',
            channels: ['in_app', 'email', 'push'],
            dedupeKey: 'queue_failure:' . $jobName . ':' . $connection . ':' . $queue . ':' . now()->format('YmdHi'),
        ));
    }

    public function notifyStorageLimitExceeded(int $usedBytes, int $limitBytes): Collection
    {
        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'storage_limit_exceeded',
            title: 'Storage limit exceeded',
            titleAr: 'تم تجاوز حد التخزين',
            body: 'Backup storage usage exceeded the configured threshold.',
            bodyAr: 'استهلاك تخزين النسخ الاحتياطية تجاوز الحد المسموح.',
            category: 'storage',
            severity: 'warning',
            source: 'backup_storage',
            data: [
                'used_bytes' => $usedBytes,
                'limit_bytes' => $limitBytes,
            ],
            actionUrl: '/system/backup',
            channels: ['in_app'],
            dedupeKey: 'storage_limit_exceeded:' . now()->toDateString(),
        ));
    }

    public function notifySecurityWarning(string $title, string $message, array $data = []): Collection
    {
        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'security_warning',
            title: $title,
            titleAr: $title,
            body: $message,
            bodyAr: $message,
            category: 'security',
            severity: 'warning',
            source: 'security',
            data: $data,
            actionUrl: '/system/admin-users',
            channels: ['in_app', 'email'],
            dedupeKey: 'security_warning:' . md5($title . '|' . $message . '|' . json_encode($data)) . ':' . now()->format('YmdH'),
        ));
    }

    public function safe(callable $callback): void
    {
        try {
            $callback();
        } catch (Throwable $e) {
        }
    }
}
