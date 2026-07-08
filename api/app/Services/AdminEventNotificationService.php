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
            body: "New tenant {$tenant->name} has been provisioned successfully.",
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
            body: "Tenant {$tenant->name} is now active.",
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
        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'tenant_subscription_expiring_soon',
            title: 'Tenant subscription expiring soon',
            body: "Tenant {$tenant->name} expires in {$daysLeft} day(s).",
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
        ));
    }

    public function notifyBackupFailed(TenantBackup $backup, ?Tenant $tenant = null): Collection
    {
        $tenantName = $tenant?->name ?? 'Platform';

        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'backup_failed',
            title: 'Backup failed',
            body: "Backup failed for {$tenantName}. " . trim((string) $backup->error_message),
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
            body: "Payment failed for tenant {$tenant?->name}. Amount: {$amount} {$transaction->currency}.",
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
            body: "{$provider} integration for {$tenantName} needs attention. {$reason}",
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

    public function notifyQueueFailure(string $jobName, string $connection, string $queue, string $message): Collection
    {
        return $this->notifications->notify(new AdminNotificationPayload(
            type: 'queue_failure',
            title: 'Queue job failed',
            body: "{$jobName} failed on {$connection}/{$queue}. " . $message,
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
            body: 'Backup storage usage exceeded the configured threshold.',
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
            body: $message,
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

