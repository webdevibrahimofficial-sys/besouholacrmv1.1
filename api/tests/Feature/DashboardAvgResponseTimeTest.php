<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardAvgResponseTimeTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::factory()->create([
            'name' => 'Dashboard Tenant',
            'slug' => 'dashboard-tenant',
            'domain' => 'dashboard-tenant.localhost',
        ]);

        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'admin',
            'email' => 'dashboard-admin@example.com',
            'status' => 'active',
        ]);

        Sanctum::actingAs($this->admin);
        app()->instance('tenant', $this->tenant);
        app()->instance('current_tenant_id', $this->tenant->id);
    }

    public function test_it_returns_average_response_time_for_todays_assigned_leads(): void
    {
        $assignee = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'sales person',
            'status' => 'active',
        ]);

        $leadOne = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $assignee->id,
            'assigned_at' => now()->startOfDay()->addHours(9),
            'workflow_key' => null,
        ]);

        $leadTwo = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $assignee->id,
            'assigned_at' => now()->startOfDay()->addHours(10),
            'workflow_key' => null,
        ]);

        $leadWithoutResponse = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $assignee->id,
            'assigned_at' => now()->startOfDay()->addHours(11),
            'workflow_key' => null,
        ]);

        LeadAction::create([
            'tenant_id' => $this->tenant->id,
            'lead_id' => $leadOne->id,
            'user_id' => $assignee->id,
            'action_type' => 'call',
            'description' => 'First response on lead one',
            'created_at' => now()->startOfDay()->addHours(9)->addMinutes(10),
            'updated_at' => now()->startOfDay()->addHours(9)->addMinutes(10),
        ]);

        LeadAction::create([
            'tenant_id' => $this->tenant->id,
            'lead_id' => $leadTwo->id,
            'user_id' => $assignee->id,
            'action_type' => 'comment',
            'description' => 'First response on lead two',
            'created_at' => now()->startOfDay()->addHours(10)->addMinutes(20),
            'updated_at' => now()->startOfDay()->addHours(10)->addMinutes(20),
        ]);

        LeadAction::create([
            'tenant_id' => $this->tenant->id,
            'lead_id' => $leadWithoutResponse->id,
            'user_id' => $this->admin->id,
            'action_type' => 'comment',
            'description' => 'Action by another user should not count',
            'created_at' => now()->startOfDay()->addHours(11)->addMinutes(5),
            'updated_at' => now()->startOfDay()->addHours(11)->addMinutes(5),
        ]);

        $response = $this->getJson('/api/dashboard-data/avg-response-time');

        $response->assertOk()
            ->assertJsonPath('avg_minutes', 15)
            ->assertJsonPath('responded_leads_count', 2)
            ->assertJsonPath('unresponded_leads_count', 1)
            ->assertJsonPath('total_assigned_leads_count', 3);
    }

    public function test_it_respects_assigned_to_filter(): void
    {
        $firstAssignee = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'sales person',
            'status' => 'active',
        ]);

        $secondAssignee = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'role' => 'sales person',
            'status' => 'active',
        ]);

        $firstLead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $firstAssignee->id,
            'assigned_at' => now()->startOfDay()->addHours(9),
            'workflow_key' => null,
        ]);

        $secondLead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $secondAssignee->id,
            'assigned_at' => now()->startOfDay()->addHours(9),
            'workflow_key' => null,
        ]);

        LeadAction::create([
            'tenant_id' => $this->tenant->id,
            'lead_id' => $firstLead->id,
            'user_id' => $firstAssignee->id,
            'action_type' => 'call',
            'description' => 'First assignee response',
            'created_at' => now()->startOfDay()->addHours(9)->addMinutes(5),
            'updated_at' => now()->startOfDay()->addHours(9)->addMinutes(5),
        ]);

        LeadAction::create([
            'tenant_id' => $this->tenant->id,
            'lead_id' => $secondLead->id,
            'user_id' => $secondAssignee->id,
            'action_type' => 'call',
            'description' => 'Second assignee response',
            'created_at' => now()->startOfDay()->addHours(9)->addMinutes(25),
            'updated_at' => now()->startOfDay()->addHours(9)->addMinutes(25),
        ]);

        $response = $this->getJson('/api/dashboard-data/avg-response-time?assigned_to=' . $firstAssignee->id);

        $response->assertOk()
            ->assertJsonPath('avg_minutes', 5)
            ->assertJsonPath('responded_leads_count', 1)
            ->assertJsonPath('unresponded_leads_count', 0)
            ->assertJsonPath('total_assigned_leads_count', 1);
    }
}
