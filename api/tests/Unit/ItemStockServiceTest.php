<?php

namespace Tests\Unit;

use App\Models\InventoryRequest;
use App\Models\Item;
use App\Models\ItemStockMovement;
use App\Models\Quotation;
use App\Models\SalesInvoice;
use App\Models\Tenant;
use App\Services\ItemStockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ItemStockServiceTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected ItemStockService $stock;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->tenant = Tenant::factory()->create(['slug' => 'stock-tenant']);
        $this->stock = app(ItemStockService::class);
    }

    private function makeItem(int $available = 10, array $overrides = []): Item
    {
        return Item::create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'Stock Item '.uniqid(),
            'code' => 'SKU-'.uniqid(),
            'quantity' => $available,
            'reserved_quantity' => 0,
            'sold_quantity' => 0,
            'min_alert' => 0,
            'price' => 100,
        ], $overrides));
    }

    public function test_reserve_moves_available_to_reserved(): void
    {
        $item = $this->makeItem(10);

        $this->stock->reserve($item, 3, 'test');
        $item->refresh();

        $this->assertSame(7, (int) $item->quantity);
        $this->assertSame(3, (int) $item->reserved_quantity);
        $this->assertSame(0, (int) $item->sold_quantity);
        $this->assertSame(10, (int) $item->total_quantity);
        $this->assertTrue(ItemStockMovement::query()->where('item_id', $item->id)->exists());
    }

    public function test_cannot_reserve_more_than_available(): void
    {
        $item = $this->makeItem(2);

        $this->expectException(ValidationException::class);
        $this->stock->assertCanReserve([['item' => $item->id, 'quantity' => 5]]);
    }

    public function test_release_returns_reserved_to_available(): void
    {
        $item = $this->makeItem(10);
        $this->stock->reserve($item, 4, 'test');
        $this->stock->release($item->fresh(), 4, 'test');
        $item->refresh();

        $this->assertSame(10, (int) $item->quantity);
        $this->assertSame(0, (int) $item->reserved_quantity);
    }

    public function test_sell_from_reserved_then_return_to_available(): void
    {
        $item = $this->makeItem(8);
        $this->stock->reserve($item, 5, 'test');
        $this->stock->sellFromReserved($item->fresh(), 5, 'sales_invoice');
        $item->refresh();

        $this->assertSame(3, (int) $item->quantity);
        $this->assertSame(0, (int) $item->reserved_quantity);
        $this->assertSame(5, (int) $item->sold_quantity);

        $this->stock->returnSold($item->fresh(), 2, 'sales_invoice_return');
        $item->refresh();

        $this->assertSame(5, (int) $item->quantity);
        $this->assertSame(3, (int) $item->sold_quantity);
    }

    public function test_quotation_release_unfreezes_converted_request(): void
    {
        $item = $this->makeItem(6);
        $request = InventoryRequest::create([
            'tenant_id' => $this->tenant->id,
            'product' => $item->name,
            'quantity' => 2,
            'status' => 'Converted',
        ]);
        $this->stock->reserveForRequest($request, $item, 2);
        $this->stock->freezeRequest($request->fresh());

        $item->refresh();
        $this->assertSame(4, (int) $item->quantity);
        $this->assertSame(2, (int) $item->reserved_quantity);

        $quotation = Quotation::create([
            'tenant_id' => $this->tenant->id,
            'customer_name' => 'Quote Customer',
            'status' => 'Cancelled',
            'meta_data' => ['converted_from_request_id' => $request->id],
        ]);

        $this->stock->releaseQuotation($quotation);
        $item->refresh();
        $request->refresh();

        $this->assertSame(6, (int) $item->quantity);
        $this->assertSame(0, (int) $item->reserved_quantity);
        $this->assertSame(ItemStockService::STATE_RELEASED, $request->meta_data['stock']['state'] ?? null);
    }

    public function test_expire_skips_frozen_converted_reservations(): void
    {
        $item = $this->makeItem(5);
        $request = InventoryRequest::create([
            'tenant_id' => $this->tenant->id,
            'product' => $item->name,
            'quantity' => 2,
            'status' => 'Converted',
        ]);
        $this->stock->reserveForRequest($request, $item, 2, now()->subHour());
        $this->stock->freezeRequest($request->fresh());

        $expired = $this->stock->expireDueRequests();
        $item->refresh();

        $this->assertSame(0, $expired);
        $this->assertSame(3, (int) $item->quantity);
        $this->assertSame(2, (int) $item->reserved_quantity);
    }

    public function test_expire_releases_unfrozen_past_hold(): void
    {
        $item = $this->makeItem(5);
        $request = InventoryRequest::create([
            'tenant_id' => $this->tenant->id,
            'product' => $item->name,
            'quantity' => 2,
            'status' => 'Pending',
        ]);
        $this->stock->reserveForRequest($request, $item, 2, now()->subHour());

        $expired = $this->stock->expireDueRequests();
        $item->refresh();
        $request->refresh();

        $this->assertSame(1, $expired);
        $this->assertSame(5, (int) $item->quantity);
        $this->assertSame(0, (int) $item->reserved_quantity);
        $this->assertSame('Expired', $request->status);
    }

    public function test_reserve_and_sell_request_handles_multiple_item_lines(): void
    {
        $first = $this->makeItem(5, ['name' => 'Laptop']);
        $second = $this->makeItem(7, ['name' => 'Printer']);
        $request = InventoryRequest::create([
            'tenant_id' => $this->tenant->id,
            'product' => $first->name,
            'quantity' => 3,
            'status' => 'Pending',
        ]);

        $this->stock->reserveForRequest($request, $first, 1);
        $this->stock->reserveForRequest($request->fresh(), $second, 2);
        $first->refresh();
        $second->refresh();
        $request->refresh();

        $this->assertCount(2, $request->meta_data['stock_lines'] ?? []);
        $this->assertSame(4, (int) $first->quantity);
        $this->assertSame(5, (int) $second->quantity);

        $this->stock->sellRequest($request->fresh(), 'lead_action', 12);
        $first->refresh();
        $second->refresh();
        $request->refresh();

        $this->assertSame(4, (int) $first->quantity);
        $this->assertSame(0, (int) $first->reserved_quantity);
        $this->assertSame(1, (int) $first->sold_quantity);
        $this->assertSame(5, (int) $second->quantity);
        $this->assertSame(0, (int) $second->reserved_quantity);
        $this->assertSame(2, (int) $second->sold_quantity);
        $this->assertSame(ItemStockService::STATE_SOLD, $request->meta_data['stock']['state'] ?? null);
    }

    public function test_posted_invoice_sells_available_and_return_restores_it(): void
    {
        $item = $this->makeItem(10);
        $invoice = SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'customer_name' => 'Invoice Customer',
            'issue_date' => now()->toDateString(),
            'status' => 'Posted',
            'total' => 200,
            'items' => [
                ['item_id' => $item->id, 'name' => $item->name, 'quantity' => 4, 'price' => 50],
            ],
        ]);

        $this->stock->applyInvoiceSold($invoice);
        $item->refresh();
        $this->assertSame(6, (int) $item->quantity);
        $this->assertSame(4, (int) $item->sold_quantity);

        $this->stock->returnInvoiceItems($invoice->fresh(), [
            ['item_id' => $item->id, 'quantity' => 1],
        ]);
        $item->refresh();

        $this->assertSame(7, (int) $item->quantity);
        $this->assertSame(3, (int) $item->sold_quantity);
    }
}
