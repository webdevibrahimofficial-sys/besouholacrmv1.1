<?php

namespace Tests\Feature;

use App\Jobs\SendFcmNotificationJob;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use App\Notifications\LeadAssigned;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Spatie\Multitenancy\Jobs\NotTenantAware;
use Tests\TestCase;

class FcmNotificationDispatchTest extends TestCase
{
    use RefreshDatabase;

    public function test_send_fcm_notification_job_defaults_to_fcm_queue(): void
    {
        $job = new SendFcmNotificationJob(
            userId: 10,
            tenantId: 20,
            title: 'Queue Test',
            body: 'Queue body',
            data: ['type' => 'test'],
        );

        $this->assertSame('fcm', $job->queue);
        $this->assertSame(config('queue.fcm_connection', 'redis'), $job->connection);
        $this->assertInstanceOf(NotTenantAware::class, $job);
    }

    public function test_lead_assignment_notification_dispatches_fcm_job_to_fcm_queue(): void
    {
        Queue::fake();

        $tenant = Tenant::create([
            'name' => 'FCM Tenant',
            'slug' => 'fcm-tenant',
            'status' => 'active',
        ]);

        $assignee = User::factory()->create([
            'tenant_id' => $tenant->id,
            'notification_settings' => ['app' => true],
        ]);

        $assigner = User::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Queue Assigner',
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $assignee->id,
            'created_by' => $assigner->id,
        ]);

        $lead->load('assignedAgent');

        $assignee->notify(new LeadAssigned($lead, $assigner->name));

        Queue::assertPushed(SendFcmNotificationJob::class, function (SendFcmNotificationJob $job) use ($assignee, $tenant, $lead) {
            return $job->queue === 'fcm'
                && $job->connection === config('queue.fcm_connection', 'redis')
                && $job->userId === $assignee->id
                && $job->tenantId === $tenant->id
                && $job->title === 'Lead Assigned'
                && $job->data['lead_id'] === (string) $lead->id;
        });
    }
}
