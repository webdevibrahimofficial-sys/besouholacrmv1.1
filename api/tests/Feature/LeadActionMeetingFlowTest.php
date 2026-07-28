<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\Stage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeadActionMeetingFlowTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $user;
    protected Lead $lead;
    protected Stage $meetingStage;
    protected Stage $followUpStage;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::factory()->create(['slug' => 'meeting-tenant']);
        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'job_title' => 'Sales Person',
        ]);
        $this->lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'created_by' => $this->user->id,
        ]);
        $this->meetingStage = Stage::create(['tenant_id' => $this->tenant->id, 'name' => 'Meeting']);
        $this->followUpStage = Stage::create(['tenant_id' => $this->tenant->id, 'name' => 'Follow Up']);

        Sanctum::actingAs($this->user);
    }

    public function test_meeting_stage_requires_next_action_date(): void
    {
        $response = $this->withoutMiddleware()->postJson('/api/lead-actions', [
            'lead_id' => $this->lead->id,
            'type' => 'meeting',
            'status' => 'pending',
            'stage_id' => $this->meetingStage->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['date', 'time']);
    }

    public function test_meeting_actions_can_be_rescheduled_multiple_times(): void
    {
        $payload = [
            'lead_id' => $this->lead->id,
            'type' => 'meeting',
            'status' => 'pending',
            'stage_id' => $this->meetingStage->id,
            'next_action_type' => 'meeting',
            'date' => '2026-07-29',
            'time' => '10:00',
        ];

        $this->withoutMiddleware()->postJson('/api/lead-actions', $payload)->assertCreated();
        $this->withoutMiddleware()->postJson('/api/lead-actions', array_merge($payload, ['time' => '11:00']))->assertCreated();
        $this->withoutMiddleware()->postJson('/api/lead-actions', array_merge($payload, ['time' => '12:00', 'meeting_status' => 'done']))->assertCreated();
        $this->withoutMiddleware()->postJson('/api/lead-actions', array_merge($payload, ['time' => '13:00', 'meeting_status' => 'no_show']))->assertCreated();

        $this->assertSame(4, LeadAction::where('lead_id', $this->lead->id)->count());
    }

    public function test_lead_can_leave_meeting_stage_without_outcome_lock(): void
    {
        $this->withoutMiddleware()->postJson('/api/lead-actions', [
            'lead_id' => $this->lead->id,
            'type' => 'meeting',
            'status' => 'pending',
            'stage_id' => $this->meetingStage->id,
            'next_action_type' => 'meeting',
            'date' => '2026-07-29',
            'time' => '10:00',
        ])->assertCreated();

        $response = $this->withoutMiddleware()->postJson('/api/lead-actions', [
            'lead_id' => $this->lead->id,
            'type' => 'call',
            'status' => 'pending',
            'stage_id' => $this->followUpStage->id,
            'date' => '2026-07-30',
            'time' => '10:00',
        ]);

        $response->assertCreated();
        $this->assertSame($this->followUpStage->id, $this->lead->fresh()->stage_id);
    }
}
