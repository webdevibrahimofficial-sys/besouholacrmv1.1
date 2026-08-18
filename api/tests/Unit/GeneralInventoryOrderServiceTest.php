<?php

namespace Tests\Unit;

use App\Models\Item;
use App\Models\Lead;
use App\Models\Order;
use App\Models\Tenant;
use App\Models\User;
use App\Services\GeneralInventory\GeneralInventoryOrderService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class GeneralInventoryOrderServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_sync_from_reservation_creates_one_order_with_multiple_lines(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-order-service']);
        $actor = User::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Sales Owner']);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $actor->id,
            'created_by' => $actor->id,
            'name' => 'Multi Item Lead',
        ]);
        $firstItem = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Laptop',
            'code' => 'LAP-100',
            'quantity' => 10,
            'price' => 5000,
        ]);
        $secondItem = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Mouse',
            'code' => 'MOU-200',
            'quantity' => 20,
            'price' => 200,
        ]);

        $service = app(GeneralInventoryOrderService::class);
        $order = $service->syncFromReservation($lead, [
            'reservationNotes' => 'Bundle request',
            'reservationGeneralItems' => [
                [
                    'item' => $firstItem->id,
                    'item_name' => $firstItem->name,
                    'quantity' => 2,
                    'price' => 5000,
                    'line_total' => 10000,
                ],
                [
                    'item' => $secondItem->id,
                    'item_name' => $secondItem->name,
                    'quantity' => 3,
                    'price' => 200,
                    'line_total' => 600,
                ],
            ],
        ], 7001, $actor);

        $order->refresh();
        $this->assertSame(1, Order::query()->count());
        $this->assertSame('PendingApproval', $order->status);
        $this->assertCount(2, $order->lines);
        $this->assertSame(10600.0, (float) $order->total);
        $this->assertSame(7001, (int) ($order->meta_data['general_inventory']['reservation_source_action_id'] ?? 0));
    }

    public function test_sync_from_reservation_when_item_category_column_is_a_string(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-order-category-string']);
        $actor = User::factory()->create(['tenant_id' => $tenant->id]);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $actor->id,
            'created_by' => $actor->id,
            'name' => 'Category String Lead',
        ]);
        $category = \App\Models\ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Devices',
            'applies_to' => 'Products',
        ]);
        $item = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Phone',
            'code' => 'PHN-STR-1',
            'category' => 'Devices',
            'category_id' => $category->id,
            'quantity' => 5,
            'price' => 3000,
        ]);

        $order = app(GeneralInventoryOrderService::class)->syncFromReservation($lead, [
            'reservationGeneralItems' => [[
                'item' => $item->id,
                'item_name' => $item->name,
                'quantity' => 1,
                'price' => 3000,
                'line_total' => 3000,
            ]],
        ], 8001, $actor);

        $this->assertSame(3000.0, (float) $order->total);
        $this->assertSame(1, $order->lines()->count());
    }

    public function test_non_manager_cannot_approve_general_inventory_order_request(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-order-service-approval']);
        $salesUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Sales Person',
        ]);
        $order = Order::create([
            'tenant_id' => $tenant->id,
            'status' => 'PendingApproval',
            'amount' => 1000,
            'customer_name' => 'Customer',
            'items' => [],
            'tax' => 0,
            'total' => 1000,
            'meta_data' => [
                'general_inventory' => [
                    'workflow' => 'general_inventory_order_request',
                    'lead_id' => 1,
                    'reservation_source_action_id' => 123,
                ],
            ],
        ]);

        $service = app(GeneralInventoryOrderService::class);

        $this->expectException(AuthorizationException::class);
        $service->prepareOrderUpdate($order, ['status' => 'Approved'], $salesUser);
    }

    public function test_approved_general_inventory_order_requires_reapproval_for_line_changes(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-order-service-reapproval']);
        $manager = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Operation Manager',
        ]);
        $order = Order::create([
            'tenant_id' => $tenant->id,
            'status' => 'Approved',
            'amount' => 1000,
            'customer_name' => 'Customer',
            'items' => [['name' => 'Item A', 'quantity' => 1, 'price' => 1000, 'line_total' => 1000]],
            'tax' => 0,
            'total' => 1000,
            'meta_data' => [
                'general_inventory' => [
                    'workflow' => 'general_inventory_order_request',
                    'lead_id' => 1,
                    'reservation_source_action_id' => 123,
                ],
            ],
        ]);

        $service = app(GeneralInventoryOrderService::class);

        try {
            $service->prepareOrderUpdate($order, [
                'items' => [
                    ['name' => 'Item A', 'quantity' => 2, 'price' => 1000, 'line_total' => 2000],
                ],
            ], $manager);
            $this->fail('Expected validation exception for line change without re-approval.');
        } catch (ValidationException $e) {
            $this->assertArrayHasKey('status', $e->errors());
        }

        $prepared = $service->prepareOrderUpdate($order, [
            'status' => 'pending_approval',
            'items' => [
                ['name' => 'Item A', 'quantity' => 2, 'price' => 1000, 'line_total' => 2000],
            ],
        ], $manager);

        $this->assertSame('PendingApproval', $prepared['status']);
        $this->assertSame(2000.0, (float) $prepared['total']);
        $this->assertTrue((bool) ($prepared['meta_data']['general_inventory']['reapproval_required'] ?? false));
    }

    public function test_mixed_product_and_service_lines_are_supported_with_type_specific_validation(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-order-service-mixed']);
        $actor = User::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Sales Owner']);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $actor->id,
            'created_by' => $actor->id,
        ]);
        $productCategory = \App\Models\ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Hardware',
            'applies_to' => 'Product',
        ]);
        $serviceCategory = \App\Models\ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Subscriptions',
            'applies_to' => 'Service',
        ]);
        $product = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Laptop',
            'code' => 'LAP-500',
            'category_id' => $productCategory->id,
            'quantity' => 10,
            'price' => 5000,
        ]);
        $service = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'CRM Subscription',
            'code' => 'CRM-600',
            'category_id' => $serviceCategory->id,
            'quantity' => 100,
            'price' => 2000,
            'billing_cycle' => 'Monthly',
        ]);

        $serviceInstance = app(GeneralInventoryOrderService::class);
        $order = $serviceInstance->syncFromReservation($lead, [
            'reservationGeneralItems' => [
                [
                    'item' => $product->id,
                    'quantity' => 1,
                    'price' => 5000,
                    'line_total' => 5000,
                ],
                [
                    'item' => $service->id,
                    'quantity' => 2,
                    'price' => 2000,
                    'line_total' => 4000,
                    'billing_type' => 'Monthly',
                ],
            ],
        ], 9901, $actor);

        $order->refresh();
        $this->assertCount(2, $order->lines);
        $this->assertSame('product', $order->lines[0]->item_type);
        $this->assertSame('service', $order->lines[1]->item_type);
        $this->assertSame('Monthly', $order->lines[1]->billing_type);
        $this->assertSame(9000.0, (float) $order->total);
    }

    public function test_approved_order_snapshot_can_drive_general_closing(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'general-order-closing-snapshot']);
        $order = Order::create([
            'tenant_id' => $tenant->id,
            'status' => 'Approved',
            'amount' => 9000,
            'customer_name' => 'Customer',
            'items' => [],
            'tax' => 0,
            'total' => 9000,
            'meta_data' => [
                'general_inventory' => [
                    'workflow' => 'general_inventory_order_request',
                    'lead_id' => 45,
                    'reservation_source_action_id' => 77,
                ],
            ],
        ]);

        $order->lines()->createMany([
            [
                'tenant_id' => $tenant->id,
                'item_type' => 'product',
                'item_name_snapshot' => 'Laptop',
                'quantity' => 1,
                'unit_price' => 5000,
                'line_subtotal' => 5000,
                'discount_amount' => 0,
                'tax_amount' => 0,
                'line_total' => 5000,
            ],
            [
                'tenant_id' => $tenant->id,
                'item_type' => 'service',
                'item_name_snapshot' => 'CRM Subscription',
                'quantity' => 2,
                'unit_price' => 2000,
                'line_subtotal' => 4000,
                'discount_amount' => 0,
                'tax_amount' => 0,
                'line_total' => 4000,
                'billing_type' => 'Monthly',
            ],
        ]);

        $service = app(GeneralInventoryOrderService::class);
        $snapshot = $service->orderSnapshotForClosing($tenant->id, 45, 77);

        $this->assertNotNull($snapshot);
        $this->assertSame(9000.0, (float) $snapshot['total']);
        $this->assertCount(2, $snapshot['lines']);
        $this->assertSame('Monthly', $snapshot['lines'][1]['billing_type']);
    }
}
