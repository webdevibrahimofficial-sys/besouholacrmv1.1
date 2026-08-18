<?php

namespace Tests\Unit;

use App\Models\InventoryRequest;
use App\Models\Item;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use App\Services\GeneralInventory\GeneralInventoryRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GeneralInventoryRequestServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_sync_reservation_creates_single_reserved_request_for_general_inventory(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-inventory-request']);
        $actor = User::factory()->create(['tenant_id' => $tenant->id, 'name' => 'General Seller']);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $actor->id,
            'created_by' => $actor->id,
            'name' => 'Request Lead',
            'phone' => '01000000111',
        ]);
        $item = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Laptop',
            'code' => 'LAP-001',
            'quantity' => 10,
            'reserved_quantity' => 0,
            'sold_quantity' => 0,
            'price' => 1500,
        ]);

        $service = app(GeneralInventoryRequestService::class);
        $details = [
            'reservationNotes' => 'General reservation',
            'reservationGeneralItems' => [[
                'item' => $item->id,
                'item_name' => $item->name,
                'quantity' => 2,
                'price' => 1500,
                'line_total' => 3000,
            ]],
        ];

        $service->syncReservationRequests($lead, $details, 77, true, false, now()->addHour(), 501, $actor);
        $service->syncReservationRequests($lead, $details, 77, true, false, now()->addHour(), 501, $actor);

        $this->assertSame(1, InventoryRequest::query()->count());

        $request = InventoryRequest::query()->firstOrFail();
        $item->refresh();

        $this->assertSame('Booking', $request->type);
        $this->assertSame(77, (int) ($request->meta_data['source_action_id'] ?? 0));
        $this->assertSame('reserved', $request->meta_data['stock']['state'] ?? null);
        $this->assertSame(8, (int) $item->quantity);
        $this->assertSame(2, (int) $item->reserved_quantity);
    }

    public function test_sync_reservation_does_not_move_stock_for_service_items(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-inventory-service-request']);
        $actor = User::factory()->create(['tenant_id' => $tenant->id]);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $actor->id,
            'created_by' => $actor->id,
            'name' => 'Service Lead',
        ]);
        $category = \App\Models\ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Hosting',
            'applies_to' => 'Services',
        ]);
        $item = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Hosting Plan',
            'code' => 'HOST-REQ-1',
            'category_id' => $category->id,
            'quantity' => 0,
            'reserved_quantity' => 0,
            'sold_quantity' => 0,
            'price' => 9000,
            'billing_cycle' => 'Monthly',
            'meta_data' => ['general_inventory' => ['business_type' => 'service']],
        ]);

        app(GeneralInventoryRequestService::class)->syncReservationRequests($lead, [
            'reservationGeneralItems' => [[
                'item' => $item->id,
                'item_name' => $item->name,
                'quantity' => 1,
                'price' => 9000,
                'line_total' => 9000,
                'business_type' => 'service',
            ]],
        ], 88, true, false, now()->addHour(), 601, $actor);

        $item->refresh();
        $request = InventoryRequest::query()->firstOrFail();
        $this->assertSame(0, (int) $item->quantity);
        $this->assertSame(0, (int) $item->reserved_quantity);
        $this->assertSame('Booking', $request->type);
        $this->assertNull($request->meta_data['stock']['state'] ?? null);
    }

    public function test_sync_reservation_creates_one_request_for_multiple_items(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-inventory-multi-request']);
        $actor = User::factory()->create(['tenant_id' => $tenant->id]);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $actor->id,
            'created_by' => $actor->id,
            'name' => 'Bundle Lead',
        ]);
        $first = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Laptop',
            'code' => 'LAP-MULTI-1',
            'quantity' => 10,
            'reserved_quantity' => 0,
            'sold_quantity' => 0,
            'price' => 5000,
        ]);
        $second = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Printer',
            'code' => 'PRN-MULTI-1',
            'quantity' => 10,
            'reserved_quantity' => 0,
            'sold_quantity' => 0,
            'price' => 3000,
        ]);

        app(GeneralInventoryRequestService::class)->syncReservationRequests($lead, [
            'reservationNotes' => 'Bundle reservation',
            'reservationGeneralItems' => [
                [
                    'item' => $first->id,
                    'item_name' => $first->name,
                    'quantity' => 1,
                    'price' => 5000,
                    'line_total' => 5000,
                ],
                [
                    'item' => $second->id,
                    'item_name' => $second->name,
                    'quantity' => 2,
                    'price' => 3000,
                    'line_total' => 6000,
                ],
            ],
        ], 91, true, false, now()->addHour(), 701, $actor);

        $this->assertSame(1, InventoryRequest::query()->count());
        $request = InventoryRequest::query()->firstOrFail();
        $first->refresh();
        $second->refresh();

        $this->assertCount(2, $request->meta_data['reservationGeneralItems'] ?? []);
        $this->assertFalse(array_key_exists('source_action_line', $request->meta_data ?? []));
        $this->assertSame(11000.0, (float) ($request->meta_data['reservationAmount'] ?? 0));
        $this->assertCount(2, $request->meta_data['stock_lines'] ?? []);
        $this->assertSame(9, (int) $first->quantity);
        $this->assertSame(1, (int) $first->reserved_quantity);
        $this->assertSame(8, (int) $second->quantity);
        $this->assertSame(2, (int) $second->reserved_quantity);
    }
}
