<?php

namespace Tests\Feature;

use App\Console\Commands\ProcessRotationRules;
use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\RotationRule;
use App\Models\RotationSetting;
use App\Models\Stage;
use App\Models\Tenant;
use App\Models\User;
use App\Services\LeadRotationEngine;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class DelayRotationStageDelayTest extends TestCase
{
    use RefreshDatabase;

    public function test_resolve_stage_delay_hours_uses_stage_id_name_and_type(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);

        $meeting = Stage::create([
            'tenant_id' => $tenant->id,
            'name' => 'meeting',
            'name_ar' => 'اجتماع',
            'type' => 'meeting',
            'delay_time' => 5,
            'order' => 2,
        ]);
        Stage::create([
            'tenant_id' => $tenant->id,
            'name' => 'follow up',
            'name_ar' => 'متابعة مخصصة',
            'type' => 'follow_up',
            'delay_time' => 3,
            'order' => 1,
        ]);

        $engine = app(LeadRotationEngine::class);

        $byId = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'stage' => 'Something Else',
            'stage_id' => $meeting->id,
        ]);
        $this->assertSame(5, $engine->resolveStageDelayHours($byId, (int) $tenant->id));

        // Case/spacing should still resolve to the tenant stage delay (not global delay=0).
        $byName = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'stage' => 'Follow Up',
            'stage_id' => null,
        ]);
        $this->assertSame(3, $engine->resolveStageDelayHours($byName, (int) $tenant->id));

        $byType = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'stage' => 'follow_up',
            'stage_id' => null,
        ]);
        $this->assertSame(3, $engine->resolveStageDelayHours($byType, (int) $tenant->id));
    }

    public function test_delay_rotation_skips_when_stage_delay_time_is_zero(): void
    {
        [$tenant, $salesA, $salesB, $lead] = $this->seedDelayRotationScenario(delayHours: 0, overdueHours: 10);

        Artisan::call(ProcessRotationRules::class, ['--tenant' => $tenant->id]);

        $lead->refresh();
        $this->assertSame((int) $salesA->id, (int) $lead->assigned_to);
        $this->assertNotSame((int) $salesB->id, (int) $lead->assigned_to);
    }

    public function test_delay_rotation_reassigns_after_stage_delay_hours(): void
    {
        [$tenant, $salesA, $salesB, $lead] = $this->seedDelayRotationScenario(delayHours: 2, overdueHours: 5);

        Artisan::call(ProcessRotationRules::class, ['--tenant' => $tenant->id]);

        $lead->refresh();
        $this->assertSame((int) $salesB->id, (int) $lead->assigned_to);
    }

    private function seedDelayRotationScenario(int $delayHours, int $overdueHours): array
    {
        $tenant = Tenant::factory()->create(['status' => 'active', 'company_type' => 'realestate']);
        app()->instance('current_tenant_id', $tenant->id);
        app()->instance('tenant', $tenant);

        $salesA = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
            'status' => 'Active',
        ]);
        $salesB = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
            'status' => 'Active',
        ]);

        Stage::create([
            'tenant_id' => $tenant->id,
            'name' => 'follow up',
            'type' => 'follow_up',
            'delay_time' => $delayHours,
            'order' => 1,
        ]);

        RotationSetting::create([
            'tenant_id' => $tenant->id,
            'allow_assign_rotation' => false,
            'delay_assign_rotation' => true,
            'work_from' => '00:00',
            'work_to' => '23:59',
            'delay_work_from' => '00:00',
            'delay_work_to' => '23:59',
        ]);

        RotationRule::create([
            'tenant_id' => $tenant->id,
            'user_id' => $salesA->id,
            'type' => 'delay',
            'position' => 1,
            'is_active' => true,
        ]);
        RotationRule::create([
            'tenant_id' => $tenant->id,
            'user_id' => $salesB->id,
            'type' => 'delay',
            'position' => 2,
            'is_active' => true,
        ]);
        RotationRule::create([
            'tenant_id' => $tenant->id,
            'user_id' => $salesA->id,
            'type' => 'assign',
            'position' => 1,
            'is_active' => true,
        ]);
        RotationRule::create([
            'tenant_id' => $tenant->id,
            'user_id' => $salesB->id,
            'type' => 'assign',
            'position' => 2,
            'is_active' => true,
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'stage' => 'Follow Up',
            'assigned_to' => $salesA->id,
            'source' => null,
            'project_id' => null,
            'location' => null,
        ]);

        $scheduled = Carbon::now(config('app.timezone'))->subHours($overdueHours);
        LeadAction::create([
            'tenant_id' => $tenant->id,
            'lead_id' => $lead->id,
            'user_id' => $salesA->id,
            'action_type' => 'follow_up',
            'next_action_type' => 'follow_up',
            'description' => 'test',
            'details' => [
                'status' => 'pending',
                'date' => $scheduled->format('Y-m-d'),
                'time' => $scheduled->format('H:i'),
            ],
        ]);

        return [$tenant, $salesA, $salesB, $lead];
    }
}
