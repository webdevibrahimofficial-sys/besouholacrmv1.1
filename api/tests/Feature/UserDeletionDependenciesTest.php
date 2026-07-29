<?php

namespace Tests\Feature;

use App\Models\Broker;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserDeletionDependenciesTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_delete_is_blocked_until_leads_and_brokers_are_reassigned(): void
    {
        $tenant = Tenant::factory()->create();
        $actor = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Director',
        ]);
        $deletingUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
        ]);
        $leadTarget = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Manager',
        ]);
        $brokerTarget = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
        ]);

        Lead::factory()->count(2)->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $deletingUser->id,
            'sales_person' => $deletingUser->name,
            'stage' => 'New Lead',
            'status' => 'new',
            'source' => 'Website',
        ]);

        Broker::create([
            'tenant_id' => $tenant->id,
            'name' => 'Solo Broker',
            'meta_data' => [
                'assigned_sales_person_ids' => [$deletingUser->id],
            ],
        ]);

        Broker::create([
            'tenant_id' => $tenant->id,
            'name' => 'Shared Broker',
            'meta_data' => [
                'assigned_sales_person_ids' => [$deletingUser->id, $brokerTarget->id],
            ],
        ]);

        Sanctum::actingAs($actor);

        $this->getJson("/api/users/{$deletingUser->id}/dependency-summary")
            ->assertOk()
            ->assertJsonPath('dependencies.leads.count', 2)
            ->assertJsonPath('dependencies.brokers.count', 2)
            ->assertJsonPath('dependencies.brokers.sole_assigned_count', 1)
            ->assertJsonPath('dependencies.brokers.shared_assigned_count', 1)
            ->assertJsonPath('can_delete', false);

        $this->deleteJson("/api/users/{$deletingUser->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'user_dependencies_exist');

        $this->postJson("/api/users/{$deletingUser->id}/reassign-dependencies", [
            'lead_target_user_id' => $leadTarget->id,
            'lead_stage' => 'same_stage',
            'lead_history_option' => 'keep_history',
            'broker_target_user_id' => $brokerTarget->id,
        ])
            ->assertOk()
            ->assertJsonPath('summary.can_delete', true);

        $this->assertSame(0, Lead::query()->where('assigned_to', $deletingUser->id)->count());
        $this->assertSame(2, Lead::query()->where('assigned_to', $leadTarget->id)->count());

        $soloBroker = Broker::query()->where('name', 'Solo Broker')->firstOrFail();
        $sharedBroker = Broker::query()->where('name', 'Shared Broker')->firstOrFail();

        $this->assertSame([$brokerTarget->id], $soloBroker->meta_data['assigned_sales_person_ids']);
        $this->assertSame([$brokerTarget->id], $sharedBroker->meta_data['assigned_sales_person_ids']);

        $this->deleteJson("/api/users/{$deletingUser->id}")
            ->assertNoContent();
    }

    public function test_manager_only_leads_do_not_block_user_deletion(): void
    {
        $tenant = Tenant::factory()->create();
        $actor = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Director',
        ]);
        $deletingUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Manager',
        ]);
        $salesUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
            'manager_id' => $deletingUser->id,
        ]);

        Lead::factory()->count(2)->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $salesUser->id,
            'manager_id' => $deletingUser->id,
            'sales_person' => $salesUser->name,
            'stage' => 'New Lead',
            'status' => 'new',
            'source' => 'Website',
        ]);

        Sanctum::actingAs($actor);

        $this->getJson("/api/users/{$deletingUser->id}/dependency-summary")
            ->assertOk()
            ->assertJsonPath('dependencies.leads.count', 0)
            ->assertJsonPath('can_delete', true);

        $this->deleteJson("/api/users/{$deletingUser->id}")
            ->assertNoContent();

        $this->assertSame(2, Lead::query()->where('assigned_to', $salesUser->id)->count());
        $this->assertSame(2, Lead::query()->whereNull('manager_id')->count());
    }

    public function test_sales_owned_leads_can_be_reassigned_as_manager_before_deletion(): void
    {
        $tenant = Tenant::factory()->create();
        $actor = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Director',
        ]);
        $deletingUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
        ]);
        $managerTarget = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Manager',
        ]);

        $leadIds = Lead::factory()->count(2)->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $deletingUser->id,
            'sales_person' => $deletingUser->name,
            'stage' => 'Meeting',
            'status' => 'open',
            'source' => 'Website',
        ])->pluck('id')->all();

        Sanctum::actingAs($actor);

        $this->postJson("/api/users/{$deletingUser->id}/reassign-dependencies", [
            'lead_target_user_id' => $managerTarget->id,
            'assign_role' => 'manager',
            'lead_stage' => 'same_stage',
            'lead_history_option' => 'keep_history',
        ])
            ->assertOk()
            ->assertJsonPath('summary.can_delete', true);

        foreach ($leadIds as $leadId) {
            $lead = Lead::query()->findOrFail($leadId);
            $this->assertNull($lead->assigned_to);
            $this->assertSame($managerTarget->id, $lead->manager_id);
            $this->assertNull($lead->sales_person);
            $this->assertSame('pending', $lead->status);
        }

        $this->deleteJson("/api/users/{$deletingUser->id}")
            ->assertNoContent();
    }
}
