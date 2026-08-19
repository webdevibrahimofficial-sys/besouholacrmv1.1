<?php

namespace Tests\Unit;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\Tenant;
use App\Models\User;
use App\Services\GeneralInventory\GeneralInventoryRevenueService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GeneralInventoryRevenueServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_general_inventory_closing_revenue_is_idempotent_per_reservation_source_action(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-inventory-revenue']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $user->id,
            'created_by' => $user->id,
        ]);

        $firstAction = LeadAction::create([
            'tenant_id' => $tenant->id,
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'action_type' => 'closing_deal',
            'description' => 'First close',
            'details' => [],
        ]);
        $secondAction = LeadAction::create([
            'tenant_id' => $tenant->id,
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'action_type' => 'closing_deal',
            'description' => 'Second close',
            'details' => [],
        ]);

        $details = [
            'reservation_source_action_id' => 901,
            'closingRevenue' => 45000,
            'reservationGeneralItems' => [[
                'item_name' => 'CRM Subscription',
                'quantity' => 1,
                'line_total' => 45000,
            ]],
        ];

        $service = app(GeneralInventoryRevenueService::class);

        $firstRevenue = $service->createForClosingOnce($lead, $firstAction, $details);
        $secondRevenue = $service->createForClosingOnce($lead, $secondAction, $details);

        $this->assertSame($firstRevenue->id, $secondRevenue->id);
        $this->assertDatabaseCount('revenues', 1);
        $this->assertSame('web', $firstRevenue->source);
        $this->assertSame('general_inventory_closing', $firstRevenue->meta_data['general_inventory']['origin'] ?? null);
        $this->assertSame(901, (int) ($firstRevenue->meta_data['general_inventory']['reservation_source_action_id'] ?? 0));
    }
}
