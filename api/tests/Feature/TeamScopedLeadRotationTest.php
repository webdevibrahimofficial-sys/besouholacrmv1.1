<?php

namespace Tests\Feature;

use App\Console\Commands\ProcessRotationRules;
use App\Models\ImportJob;
use App\Models\Lead;
use App\Models\Project;
use App\Models\RotationRule;
use App\Models\RotationSetting;
use App\Models\Stage;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Imports\Handlers\LeadsImportHandler;
use App\Services\LeadRotationEngine;
use App\Support\TenantSourceLookup;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class TeamScopedLeadRotationTest extends TestCase
{
    use RefreshDatabase;

    private LeadRotationEngine $engine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->engine = app(LeadRotationEngine::class);
    }

    public function test_team_leader_and_sales_manager_are_team_scoped_but_admin_director_operation_are_not(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active', 'company_type' => 'realestate']);

        $salesManager = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Manager',
            'status' => 'Active',
        ]);
        $teamLeader = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Team Leader',
            'status' => 'Active',
        ]);
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'admin',
            'status' => 'Active',
        ]);
        $director = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Director',
            'status' => 'Active',
        ]);
        $operation = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Operation Manager',
            'status' => 'Active',
        ]);

        $this->assertTrue($this->engine->isTeamScopedImporter($salesManager));
        $this->assertTrue($this->engine->isTeamScopedImporter($teamLeader));
        $this->assertFalse($this->engine->isTeamScopedImporter($admin));
        $this->assertFalse($this->engine->isTeamScopedImporter($director));
        $this->assertFalse($this->engine->isTeamScopedImporter($operation));
    }

    public function test_eligible_rotation_users_can_be_scoped_to_a_manager_team(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active', 'company_type' => 'realestate']);

        $managerA = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Manager',
            'status' => 'Active',
        ]);
        $managerB = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Manager',
            'status' => 'Active',
        ]);

        $salesA1 = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
            'manager_id' => $managerA->id,
            'status' => 'Active',
        ]);
        $salesA2 = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
            'manager_id' => $managerA->id,
            'status' => 'Active',
        ]);
        $salesB1 = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
            'manager_id' => $managerB->id,
            'status' => 'Active',
        ]);

        foreach ([$salesA1, $salesA2, $salesB1] as $index => $user) {
            RotationRule::create([
                'tenant_id' => $tenant->id,
                'user_id' => $user->id,
                'type' => 'assign',
                'project_id' => null,
                'item_id' => null,
                'source' => null,
                'regions' => null,
                'position' => $index + 1,
                'is_active' => true,
            ]);
        }

        $filters = [
            'project_id' => null,
            'item_id' => null,
            'source' => null,
            'region' => null,
        ];

        $allEligible = $this->engine->getEligibleAssignUserIds((int) $tenant->id, $filters);
        $this->assertSame(
            [(int) $salesA1->id, (int) $salesA2->id, (int) $salesB1->id],
            $allEligible
        );

        $teamA = $this->engine->collectTeamMemberIds($managerA, false);
        $scopedA = $this->engine->getEligibleAssignUserIds((int) $tenant->id, $filters, $teamA);
        $this->assertSame([(int) $salesA1->id, (int) $salesA2->id], $scopedA);
        $this->assertNotContains((int) $salesB1->id, $scopedA);
    }

    public function test_process_rotation_for_manager_owned_lead_stays_inside_team(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active', 'company_type' => 'realestate']);
        app()->instance('current_tenant_id', $tenant->id);
        app()->instance('tenant', $tenant);

        $managerA = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Manager',
            'status' => 'Active',
        ]);
        $managerB = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Manager',
            'status' => 'Active',
        ]);
        $salesA = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
            'manager_id' => $managerA->id,
            'status' => 'Active',
        ]);
        $salesB = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
            'manager_id' => $managerB->id,
            'status' => 'Active',
        ]);

        RotationSetting::create([
            'tenant_id' => $tenant->id,
            'allow_assign_rotation' => true,
            'delay_assign_rotation' => false,
            'work_from' => '00:00',
            'work_to' => '23:59',
        ]);

        // Put team B first in global rotation order to prove scoping ignores them.
        RotationRule::create([
            'tenant_id' => $tenant->id,
            'user_id' => $salesB->id,
            'type' => 'assign',
            'position' => 1,
            'is_active' => true,
        ]);
        RotationRule::create([
            'tenant_id' => $tenant->id,
            'user_id' => $salesA->id,
            'type' => 'assign',
            'position' => 2,
            'is_active' => true,
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'stage' => 'New Lead',
            'status' => 'new',
            'assigned_to' => null,
            'manager_id' => $managerA->id,
            'source' => null,
            'project_id' => null,
        ]);

        Artisan::call(ProcessRotationRules::class, ['--tenant' => $tenant->id]);

        $lead->refresh();
        $this->assertSame((int) $salesA->id, (int) $lead->assigned_to);
        $this->assertNotSame((int) $salesB->id, (int) $lead->assigned_to);
    }

    public function test_process_rotation_without_team_manager_uses_all_rotation_users(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active', 'company_type' => 'realestate']);
        app()->instance('current_tenant_id', $tenant->id);
        app()->instance('tenant', $tenant);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'admin',
            'status' => 'Active',
        ]);
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

        RotationSetting::create([
            'tenant_id' => $tenant->id,
            'allow_assign_rotation' => true,
            'delay_assign_rotation' => false,
            'work_from' => '00:00',
            'work_to' => '23:59',
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
            'stage' => 'New Lead',
            'status' => 'new',
            'assigned_to' => null,
            'manager_id' => $admin->id, // Admin is not team-scoped => full queue
            'source' => null,
            'project_id' => null,
        ]);

        Artisan::call(ProcessRotationRules::class, ['--tenant' => $tenant->id]);

        $lead->refresh();
        $this->assertSame((int) $salesA->id, (int) $lead->assigned_to);
    }

    public function test_sales_manager_import_sets_manager_id_and_rotates_inside_team_only(): void
    {
        $tenant = Tenant::factory()->create(['status' => 'active', 'company_type' => 'realestate']);
        app()->instance('current_tenant_id', $tenant->id);
        app()->instance('tenant', $tenant);

        $managerA = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Manager',
            'status' => 'Active',
        ]);
        $managerB = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Manager',
            'status' => 'Active',
        ]);
        $salesA = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
            'manager_id' => $managerA->id,
            'status' => 'Active',
        ]);
        $salesB = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
            'manager_id' => $managerB->id,
            'status' => 'Active',
        ]);

        $project = Project::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Palm Hills',
            'name_ar' => 'Palm Hills',
        ]);

        Stage::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'New Lead',
            'name_ar' => 'ليد جديد',
            'type' => 'new',
            'order' => 1,
            'is_active' => true,
        ]);

        // Ensure source resolves.
        if (method_exists(TenantSourceLookup::class, 'ensureSeeded') === false) {
            \App\Models\Source::query()->create([
                'tenant_id' => $tenant->id,
                'name' => 'Facebook',
            ]);
        } else {
            \App\Models\Source::query()->create([
                'tenant_id' => $tenant->id,
                'name' => 'Facebook',
            ]);
        }

        RotationSetting::create([
            'tenant_id' => $tenant->id,
            'allow_assign_rotation' => true,
            'delay_assign_rotation' => false,
            'work_from' => '00:00',
            'work_to' => '23:59',
        ]);

        RotationRule::create([
            'tenant_id' => $tenant->id,
            'user_id' => $salesB->id,
            'type' => 'assign',
            'position' => 1,
            'is_active' => true,
        ]);
        RotationRule::create([
            'tenant_id' => $tenant->id,
            'user_id' => $salesA->id,
            'type' => 'assign',
            'position' => 2,
            'is_active' => true,
        ]);

        $job = ImportJob::query()->create([
            'tenant_id' => $tenant->id,
            'uploaded_by' => $managerA->id,
            'module' => 'leads',
            'file_name' => 'leads.xlsx',
            'status' => 'processing',
            'total_rows' => 0,
            'success_rows' => 0,
            'failed_rows' => 0,
            'duplicate_rows' => 0,
            'skipped_rows' => 0,
            'warning_rows' => 0,
        ]);

        $handler = app(LeadsImportHandler::class);
        $handler->handle($job, [[
            'name' => 'Lead One',
            'phone' => '01000000001',
            'source' => 'Facebook',
            'project' => 'Palm Hills',
            'stage' => 'New Lead',
        ]], [
            'name' => 'name',
            'phone' => 'phone',
            'source' => 'source',
            'project' => 'project',
            'stage' => 'stage',
        ], []);

        $lead = Lead::query()->where('tenant_id', $tenant->id)->where('phone', '01000000001')->first();
        $this->assertNotNull($lead);
        $this->assertSame((int) $managerA->id, (int) $lead->manager_id);
        $this->assertSame((int) $salesA->id, (int) $lead->assigned_to);
        $this->assertNotSame((int) $salesB->id, (int) $lead->assigned_to);
        $this->assertSame((int) $project->id, (int) $lead->project_id);
    }
}
