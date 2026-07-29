<?php

namespace Tests\Feature;

use App\Models\ImportJob;
use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\RealEstateRequest;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeadHistoryImportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['imports.enabled' => true]);
    }

    public function test_it_imports_grouped_history_rows_without_changing_current_lead_stage(): void
    {
        $tenant = Tenant::factory()->create([
            'name' => 'Tenant A',
            'domain' => 'tenant-a',
            'status' => 'active',
            'company_type' => 'realestate',
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Admin User',
        ]);

        $salesRep = User::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'moataz hamdy',
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Noha ibrahim lotfy',
            'phone' => '01228000000',
            'stage' => 'Meeting',
            'source' => 'Meta Ads',
            'project' => 'Palm Hills',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->postJson('/api/import-jobs', [
            'module' => 'lead_history',
            'file_name' => 'history.xlsx',
            'rows' => [
                [
                    'Client name' => 'Noha ibrahim lotfy',
                    'Mobile' => '2.01228E+11',
                    'Stage' => '',
                    'Follow Date' => '',
                    'Sales Rep' => '',
                    'Comment' => '',
                ],
                [
                    'Client name' => '',
                    'Mobile' => '',
                    'Stage' => 'No Answer',
                    'Follow Date' => '2025-07-26 17:37:17',
                    'Sales Rep' => 'moataz hamdy',
                    'Comment' => 'first try',
                ],
                [
                    'Client name' => '',
                    'Mobile' => '',
                    'Stage' => 'Reservation',
                    'Follow Date' => '2025-08-01 11:00:00',
                    'Sales Rep' => 'moataz hamdy',
                    'Comment' => 'reserved unit',
                ],
            ],
            'mapping' => [
                'Client name' => 'name',
                'Mobile' => 'phone',
                'Stage' => 'stage',
                'Follow Date' => 'action_at',
                'Sales Rep' => 'assigned_to',
                'Comment' => 'comment',
            ],
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('summary.success_rows', 2)
            ->assertJsonPath('summary.skipped_rows', 1);

        $lead->refresh();
        $this->assertSame('Meeting', $lead->stage);

        $actions = LeadAction::query()
            ->where('lead_id', $lead->id)
            ->orderBy('created_at')
            ->get();

        $this->assertCount(2, $actions);
        $this->assertSame('call', $actions[0]->action_type);
        $this->assertSame('no_answer', $actions[0]->details['call_status'] ?? null);
        $this->assertSame($salesRep->id, $actions[0]->user_id);
        $this->assertSame('reservation', $actions[1]->action_type);
        $this->assertSame('Reservation', $actions[1]->details['imported_stage'] ?? null);

        $this->assertDatabaseHas('real_estate_requests', [
            'tenant_id' => $tenant->id,
            'customer_name' => 'Noha ibrahim lotfy',
            'project' => 'Palm Hills',
            'phone' => '01228000000',
        ]);

        $job = ImportJob::findOrFail((int) $response->json('job_id'));
        $this->assertSame('lead_history', $job->module);
    }

    public function test_it_marks_duplicate_history_rows_without_creating_new_actions(): void
    {
        $tenant = Tenant::factory()->create([
            'name' => 'Tenant B',
            'domain' => 'tenant-b',
            'status' => 'active',
            'company_type' => 'realestate',
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Admin User',
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Hosam Mostafa',
            'phone' => '01099990000',
            'stage' => 'Follow up',
            'source' => 'Meta Ads',
        ]);

        Sanctum::actingAs($admin);

        $payload = [
            'module' => 'lead_history',
            'file_name' => 'history.xlsx',
            'rows' => [[
                'Client name' => 'Hosam Mostafa',
                'Mobile' => '01099990000',
                'Stage' => 'Follow up',
                'Follow Date' => '2025-07-26 17:44:00',
                'Sales Rep' => 'Admin User',
                'Comment' => 'follow up note',
            ]],
            'mapping' => [
                'Client name' => 'name',
                'Mobile' => 'phone',
                'Stage' => 'stage',
                'Follow Date' => 'action_at',
                'Sales Rep' => 'assigned_to',
                'Comment' => 'comment',
            ],
        ];

        $first = $this->postJson('/api/import-jobs', $payload);
        $first->assertStatus(201)->assertJsonPath('summary.success_rows', 1);

        $second = $this->postJson('/api/import-jobs', $payload);
        $second->assertStatus(201)->assertJsonPath('summary.duplicate_rows', 1);

        $this->assertSame(1, LeadAction::query()->where('lead_id', $lead->id)->count());
    }
}
