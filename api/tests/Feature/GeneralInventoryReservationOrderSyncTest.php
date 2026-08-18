<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Lead;
use App\Models\Order;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GeneralInventoryReservationOrderSyncTest extends TestCase
{
    use RefreshDatabase;

    public function test_general_reservation_with_multiple_items_creates_one_order_request_with_multiple_lines(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-reservation-order-sync']);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
        ]);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $user->id,
            'created_by' => $user->id,
            'name' => 'Reservation Lead',
        ]);
        $firstItem = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Laptop',
            'code' => 'LAP-010',
            'quantity' => 10,
            'price' => 5000,
        ]);
        $secondItem = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Printer',
            'code' => 'PRN-020',
            'quantity' => 10,
            'price' => 3000,
        ]);

        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/lead-actions', [
            'lead_id' => $lead->id,
            'type' => 'reservation',
            'status' => 'pending',
            'reservationType' => 'general',
            'reservationNotes' => 'Need both items',
            'reservationGeneralItems' => [
                [
                    'item' => $firstItem->id,
                    'item_name' => $firstItem->name,
                    'quantity' => 1,
                    'price' => 5000,
                    'line_total' => 5000,
                ],
                [
                    'item' => $secondItem->id,
                    'item_name' => $secondItem->name,
                    'quantity' => 2,
                    'price' => 3000,
                    'line_total' => 6000,
                ],
            ],
        ])->assertCreated();

        $order = Order::query()->firstOrFail();
        $this->assertSame('PendingApproval', $order->status);
        $this->assertCount(2, $order->lines);
        $this->assertSame(11000.0, (float) $order->total);

        $this->assertSame(1, \App\Models\InventoryRequest::query()->count());
        $inventoryRequest = \App\Models\InventoryRequest::query()->firstOrFail();
        $this->assertCount(2, $inventoryRequest->meta_data['reservationGeneralItems'] ?? []);
        $this->assertSame(11000.0, (float) ($inventoryRequest->meta_data['reservationAmount'] ?? 0));
    }

    public function test_service_reservation_with_zero_catalog_quantity_creates_order_without_stock_move(): void
    {
        [$user, $lead, $serviceItem] = $this->makeGeneralLeadContext('general-service-reservation', true);
        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/lead-actions', [
            'lead_id' => $lead->id,
            'type' => 'reservation',
            'status' => 'pending',
            'reservationType' => 'general',
            'reservationGeneralItems' => [[
                'item' => $serviceItem->id,
                'item_name' => $serviceItem->name,
                'quantity' => 1,
                'price' => 10000,
                'line_total' => 10000,
            ]],
        ])->assertCreated();

        $serviceItem->refresh();
        $this->assertSame(0, (int) $serviceItem->quantity);
        $this->assertSame(0, (int) $serviceItem->reserved_quantity);

        $order = Order::query()->firstOrFail();
        $this->assertSame(1, $order->lines()->count());
        $this->assertSame('service', $order->lines()->first()->item_type);
        $this->assertSame(10000.0, (float) $order->total);
    }

    public function test_mixed_product_and_service_reservation_then_closing_deal(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-mixed-reservation']);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
        ]);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $user->id,
            'created_by' => $user->id,
            'name' => 'Mixed Lead',
        ]);
        $productCategory = \App\Models\ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Devices',
            'applies_to' => 'Products',
        ]);
        $serviceCategory = \App\Models\ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Hosting',
            'applies_to' => 'Services',
        ]);
        $product = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Router',
            'code' => 'RTR-MIX-1',
            'category_id' => $productCategory->id,
            'quantity' => 5,
            'reserved_quantity' => 0,
            'sold_quantity' => 0,
            'price' => 2000,
        ]);
        $serviceItem = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Support Plan',
            'code' => 'SUP-MIX-1',
            'category_id' => $serviceCategory->id,
            'quantity' => 0,
            'price' => 8000,
            'billing_cycle' => 'Annually',
            'meta_data' => ['general_inventory' => ['business_type' => 'service']],
        ]);

        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/lead-actions', [
            'lead_id' => $lead->id,
            'type' => 'reservation',
            'status' => 'pending',
            'reservationType' => 'general',
            'reservationGeneralItems' => [
                [
                    'item' => $product->id,
                    'item_name' => $product->name,
                    'quantity' => 1,
                    'price' => 2000,
                    'line_total' => 2000,
                ],
                [
                    'item' => $serviceItem->id,
                    'item_name' => $serviceItem->name,
                    'quantity' => 1,
                    'price' => 8000,
                    'line_total' => 8000,
                ],
            ],
        ])->assertCreated();

        $product->refresh();
        $serviceItem->refresh();
        $this->assertSame(4, (int) $product->quantity);
        $this->assertSame(1, (int) $product->reserved_quantity);
        $this->assertSame(0, (int) $serviceItem->quantity);
        $this->assertSame(0, (int) $serviceItem->reserved_quantity);

        $this->withoutMiddleware()->postJson('/api/lead-actions', [
            'lead_id' => $lead->id,
            'type' => 'closing_deals',
            'status' => 'completed',
            'reservationType' => 'general',
            'reservationGeneralItems' => [
                [
                    'item' => $product->id,
                    'quantity' => 1,
                    'price' => 2000,
                    'line_total' => 2000,
                ],
                [
                    'item' => $serviceItem->id,
                    'quantity' => 1,
                    'price' => 8000,
                    'line_total' => 8000,
                ],
            ],
        ])->assertCreated();

        $product->refresh();
        $serviceItem->refresh();
        $this->assertSame(4, (int) $product->quantity);
        $this->assertSame(0, (int) $product->reserved_quantity);
        $this->assertSame(1, (int) $product->sold_quantity);
        $this->assertSame(0, (int) $serviceItem->quantity);
        $this->assertSame(0, (int) $serviceItem->reserved_quantity);
        $this->assertSame(0, (int) $serviceItem->sold_quantity);
    }

    /**
     * @return array{0:User,1:Lead,2:Item}
     */
    private function makeGeneralLeadContext(string $slug, bool $service = false): array
    {
        $tenant = Tenant::factory()->create(['slug' => $slug]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
        ]);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $user->id,
            'created_by' => $user->id,
            'name' => 'Reservation Lead',
        ]);
        $category = \App\Models\ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => $service ? 'Hosting' : 'Devices',
            'applies_to' => $service ? 'Services' : 'Products',
        ]);
        $item = Item::create([
            'tenant_id' => $tenant->id,
            'name' => $service ? 'CRM Hosting' : 'Laptop',
            'code' => $service ? 'HOST-010' : 'LAP-010',
            'category_id' => $category->id,
            'quantity' => $service ? 0 : 10,
            'price' => $service ? 10000 : 5000,
            'billing_cycle' => $service ? 'Monthly' : null,
            'meta_data' => $service ? ['general_inventory' => ['business_type' => 'service']] : [],
        ]);

        return [$user, $lead, $item];
    }
}
