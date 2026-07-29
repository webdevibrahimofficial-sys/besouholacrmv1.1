<?php

namespace Tests\Feature;

use App\Data\AdminNotificationPayload;
use App\Models\AdminNotification;
use App\Models\SubscriptionTransaction;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AdminEventNotificationService;
use App\Services\AdminNotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SuperAdminNotificationsTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $normalUser;
    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('features.admin_notifications_v1', true);

        $this->tenant = Tenant::factory()->create();
        $this->superAdmin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'is_super_admin' => true,
        ]);
        $this->normalUser = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'is_super_admin' => false,
        ]);
    }

    public function test_only_super_admin_can_access_admin_notification_routes(): void
    {
        Sanctum::actingAs($this->normalUser);
        $this->getJson('/api/super-admin/notifications')->assertStatus(403);

        Sanctum::actingAs($this->superAdmin);
        $this->getJson('/api/super-admin/notifications')->assertStatus(200);
    }

    public function test_super_admin_can_read_and_archive_notifications(): void
    {
        Sanctum::actingAs($this->superAdmin);

        $notification = AdminNotification::create([
            'admin_user_id' => $this->superAdmin->id,
            'type' => 'system_error',
            'title' => 'Test',
            'body' => 'Body',
            'category' => 'system',
            'severity' => 'warning',
            'source' => 'queue',
        ]);

        $this->postJson("/api/super-admin/notifications/{$notification->id}/read")->assertNoContent();
        $this->postJson("/api/super-admin/notifications/{$notification->id}/archive")->assertNoContent();

        $notification->refresh();
        $this->assertNotNull($notification->read_at);
        $this->assertNotNull($notification->archived_at);
    }

    public function test_filters_and_unread_count_work(): void
    {
        Sanctum::actingAs($this->superAdmin);

        AdminNotification::create([
            'admin_user_id' => $this->superAdmin->id,
            'type' => 'a',
            'title' => 'Critical billing issue',
            'category' => 'billing',
            'severity' => 'critical',
            'source' => 'billing',
        ]);

        AdminNotification::create([
            'admin_user_id' => $this->superAdmin->id,
            'type' => 'b',
            'title' => 'Info backup',
            'category' => 'backup',
            'severity' => 'info',
            'source' => 'backup',
            'read_at' => now(),
        ]);

        $this->getJson('/api/super-admin/notifications?status=unread&severity=critical&category=billing')
            ->assertOk()
            ->assertJsonCount(1, 'notifications.data');

        $this->getJson('/api/super-admin/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('count', 1);
    }

    public function test_dedupe_prevents_duplicate_creation_per_admin(): void
    {
        Queue::fake();

        $service = app(AdminNotificationService::class);
        $payload = new AdminNotificationPayload(
            type: 'backup_failed',
            title: 'Backup failed',
            body: 'Disk full',
            category: 'backup',
            severity: 'error',
            source: 'backup',
            channels: ['in_app'],
            dedupeKey: 'backup_failed:tenant_1:daily'
        );

        $service->notify($payload, collect([$this->superAdmin]));
        $service->notify($payload, collect([$this->superAdmin]));

        $this->assertSame(
            1,
            AdminNotification::query()
                ->where('admin_user_id', $this->superAdmin->id)
                ->where('dedupe_key', 'backup_failed:tenant_1:daily')
                ->count()
        );
    }

    public function test_expiring_soon_event_creates_subscription_warning_notification(): void
    {
        $service = app(AdminEventNotificationService::class);

        $this->tenant->update([
            'status' => 'active',
            'end_date' => now()->addDays(3),
        ]);

        $service->notifyTenantExpiringSoon($this->tenant->fresh(), 3);

        $this->assertDatabaseHas('admin_notifications', [
            'admin_user_id' => $this->superAdmin->id,
            'type' => 'tenant_subscription_expiring_soon',
            'severity' => 'critical',
            'related_tenant_id' => $this->tenant->id,
        ]);
    }

    public function test_payment_failed_event_creates_billing_notification(): void
    {
        $transaction = SubscriptionTransaction::query()->create([
            'tenant_id' => $this->tenant->id,
            'type' => 'renewal',
            'status' => 'failed',
            'currency' => 'USD',
            'total_amount' => 250,
            'source' => 'manual',
        ]);

        app(AdminEventNotificationService::class)->notifyPaymentFailed($transaction->load('tenant'));

        $this->assertDatabaseHas('admin_notifications', [
            'admin_user_id' => $this->superAdmin->id,
            'type' => 'payment_failed',
            'category' => 'billing',
            'related_tenant_id' => $this->tenant->id,
        ]);
    }
}

