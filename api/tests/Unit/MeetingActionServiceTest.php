<?php

namespace Tests\Unit;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\Tenant;
use App\Models\User;
use App\Services\MeetingActionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Database\Schema\Blueprint;
use Tests\TestCase;

class MeetingActionServiceTest extends TestCase
{
    use RefreshDatabase;

    protected MeetingActionService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(MeetingActionService::class);

        if (!Schema::connection('tenant-dedicated')->hasTable('lead_action_status_audits')) {
            Schema::connection('tenant-dedicated')->create('lead_action_status_audits', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tenant_id')->nullable();
                $table->unsignedBigInteger('lead_action_id');
                $table->unsignedBigInteger('lead_id');
                $table->string('from_status')->nullable();
                $table->string('to_status');
                $table->unsignedBigInteger('changed_by')->nullable();
                $table->timestamp('changed_at')->nullable();
                $table->text('meta')->nullable();
                $table->timestamps();
            });
        }
    }

    public function test_validate_next_action_date_requires_date_and_time(): void
    {
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $this->service->validateNextActionDate(['date' => now()->toDateString()]);
    }

    public function test_validate_next_action_date_passes_when_both_present(): void
    {
        $this->service->validateNextActionDate([
            'date' => now()->toDateString(),
            'time' => '10:30',
        ]);

        $this->assertTrue(true);
    }

    public function test_record_action_always_creates_new_row_and_audit(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $lead = Lead::factory()->create(['tenant_id' => $tenant->id, 'assigned_to' => $user->id]);

        $payload = [
            'type' => 'meeting',
            'status' => 'pending',
            'date' => now()->addDay()->toDateString(),
            'time' => '09:00',
        ];

        $first = $this->service->recordAction($lead, $user, $payload, 'First meeting', null, 'meeting');
        $second = $this->service->recordAction($lead, $user, $payload, 'Second meeting', null, 'meeting');

        $this->assertNotSame($first->id, $second->id);
        $this->assertSame(2, LeadAction::where('lead_id', $lead->id)->count());
        $this->assertSame(2, DB::connection('tenant-dedicated')->table('lead_action_status_audits')->count());
    }


    public function test_done_meeting_false_without_explicit_status_defaults_to_scheduled(): void
    {
        $this->assertSame('scheduled', $this->service->normalizeMeetingStatus(null, false));
        $this->assertSame('scheduled', $this->service->normalizeMeetingStatus('', 'false'));
    }

    public function test_get_lead_meeting_counts_returns_live_totals(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $lead = Lead::factory()->create(['tenant_id' => $tenant->id, 'assigned_to' => $user->id]);

        $base = [
            'type' => 'meeting',
            'status' => 'pending',
            'date' => now()->addDay()->toDateString(),
            'time' => '09:00',
        ];

        $this->service->recordAction($lead, $user, $base, null, null, 'meeting');
        $this->service->recordAction($lead, $user, array_merge($base, ['time' => '10:00']), null, null, 'meeting');
        $this->service->recordAction($lead, $user, array_merge($base, ['time' => '11:00', 'meeting_status' => 'done']), null, null, 'meeting');
        $this->service->recordAction($lead, $user, array_merge($base, ['time' => '12:00', 'meeting_status' => 'no_show']), null, null, 'meeting');

        $this->assertSame([
            'scheduled' => 4,
            'done' => 1,
            'missed' => 1,
        ], $this->service->getLeadMeetingCounts($lead->id));
    }
}
