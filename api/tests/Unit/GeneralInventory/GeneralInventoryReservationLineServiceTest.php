<?php

namespace Tests\Unit\GeneralInventory;

use App\Models\Item;
use App\Models\ItemCategory;
use App\Models\Tenant;
use App\Services\GeneralInventory\GeneralInventoryReservationLineService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class GeneralInventoryReservationLineServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_service_line_locks_quantity_and_skips_stock_rows(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'reservation-line-service']);
        $category = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Hosting',
            'applies_to' => 'Services',
        ]);
        $item = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'CRM Hosting',
            'code' => 'HOST-LINE-1',
            'category_id' => $category->id,
            'quantity' => 0,
            'price' => 10000,
            'billing_cycle' => 'Monthly',
            'meta_data' => ['general_inventory' => ['business_type' => 'service']],
        ]);

        $service = app(GeneralInventoryReservationLineService::class);
        $rows = $service->normalizeRows([[
            'item' => $item->id,
            'quantity' => 9,
            'price' => 10000,
        ]]);

        $this->assertCount(1, $rows);
        $this->assertSame('service', $rows[0]['business_type']);
        $this->assertSame(1, $rows[0]['quantity']);
        $this->assertSame('Monthly', $rows[0]['billing_type']);
        $this->assertSame([], $service->stockCheckRows($rows));
    }

    public function test_product_line_keeps_quantity_for_stock_check(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'reservation-line-product']);
        $category = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Devices',
            'applies_to' => 'Products',
        ]);
        $item = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Laptop',
            'code' => 'LAP-LINE-1',
            'category_id' => $category->id,
            'quantity' => 10,
            'price' => 5000,
        ]);

        $service = app(GeneralInventoryReservationLineService::class);
        $rows = $service->normalizeRows([[
            'item' => $item->id,
            'quantity' => 2,
            'price' => 5000,
        ]]);

        $this->assertSame('product', $rows[0]['business_type']);
        $this->assertSame(2, $rows[0]['quantity']);
        $this->assertSame([['item' => $item->id, 'quantity' => 2]], $service->stockCheckRows($rows));
    }

    public function test_service_without_billing_type_is_rejected(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'reservation-line-billing']);
        $category = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Hosting',
            'applies_to' => 'Services',
        ]);
        $item = Item::create([
            'tenant_id' => $tenant->id,
            'name' => 'Broken Service',
            'code' => 'HOST-BAD-1',
            'category_id' => $category->id,
            'quantity' => 0,
            'price' => 1000,
            'meta_data' => ['general_inventory' => ['business_type' => 'service']],
        ]);

        $this->expectException(ValidationException::class);

        app(GeneralInventoryReservationLineService::class)->normalizeRows([[
            'item' => $item->id,
            'quantity' => 1,
            'price' => 1000,
        ]]);
    }
}
