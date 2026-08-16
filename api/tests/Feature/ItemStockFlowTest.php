<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\SalesInvoice;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ItemStockFlowTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::factory()->create(['slug' => 'item-stock-flow']);
        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'job_title' => 'Admin',
        ]);
        Sanctum::actingAs($this->user);
        app()->instance('current_tenant_id', $this->tenant->id);
    }

    public function test_posting_invoice_sells_available_quantity(): void
    {
        $item = Item::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Posted Stock Item',
            'code' => 'PST-001',
            'quantity' => 10,
            'reserved_quantity' => 0,
            'sold_quantity' => 0,
            'price' => 25,
        ]);

        $response = $this->postJson('/api/sales-invoices', [
            'customer_name' => 'Stock Customer',
            'issue_date' => '2026-08-16',
            'status' => 'Posted',
            'total' => 75,
            'items' => [
                ['item_id' => $item->id, 'name' => $item->name, 'quantity' => 3, 'price' => 25],
            ],
        ]);

        $response->assertSuccessful();
        $item->refresh();
        $this->assertSame(7, (int) $item->quantity);
        $this->assertSame(3, (int) $item->sold_quantity);
    }

    public function test_invoice_return_moves_sold_back_to_available(): void
    {
        $item = Item::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Return Stock Item',
            'code' => 'RET-001',
            'quantity' => 4,
            'reserved_quantity' => 0,
            'sold_quantity' => 6,
            'price' => 10,
        ]);

        $invoice = SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'customer_name' => 'Return Customer',
            'issue_date' => now()->toDateString(),
            'status' => 'Posted',
            'total' => 60,
            'items' => [
                ['item_id' => $item->id, 'name' => $item->name, 'quantity' => 6, 'price' => 10],
            ],
            'meta_data' => ['stock_applied' => true],
        ]);

        $response = $this->postJson("/api/sales-invoices/{$invoice->id}/returns", [
            'items' => [
                ['item_id' => $item->id, 'quantity' => 2],
            ],
        ]);

        $response->assertSuccessful();
        $item->refresh();
        $this->assertSame(6, (int) $item->quantity);
        $this->assertSame(4, (int) $item->sold_quantity);
    }

    public function test_cannot_return_more_than_invoiced_quantity(): void
    {
        $item = Item::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Over Return Item',
            'code' => 'OVR-001',
            'quantity' => 0,
            'reserved_quantity' => 0,
            'sold_quantity' => 2,
            'price' => 10,
        ]);

        $invoice = SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'customer_name' => 'Over Return Customer',
            'issue_date' => now()->toDateString(),
            'status' => 'Posted',
            'total' => 20,
            'items' => [
                ['item_id' => $item->id, 'name' => $item->name, 'quantity' => 2, 'price' => 10],
            ],
            'meta_data' => ['stock_applied' => true],
        ]);

        $this->postJson("/api/sales-invoices/{$invoice->id}/returns", [
            'items' => [
                ['item_id' => $item->id, 'quantity' => 5],
            ],
        ])->assertStatus(422);
    }
}
