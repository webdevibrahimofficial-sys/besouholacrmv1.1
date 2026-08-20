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

    public function test_invoice_refund_creates_refunded_payment_and_reduces_paid(): void
    {
        $item = Item::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Refund Money Item',
            'code' => 'RFM-001',
            'quantity' => 0,
            'reserved_quantity' => 0,
            'sold_quantity' => 2,
            'price' => 50,
        ]);

        $invoice = SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'customer_name' => 'Refund Money Customer',
            'issue_date' => now()->toDateString(),
            'status' => 'Posted',
            'payment_status' => 'Paid',
            'total' => 100,
            'paid_amount' => 100,
            'balance_due' => 0,
            'items' => [
                ['item_id' => $item->id, 'name' => $item->name, 'quantity' => 2, 'price' => 50],
            ],
            'meta_data' => ['stock_applied' => true],
        ]);

        $invoice->payments()->create([
            'tenant_id' => $this->tenant->id,
            'payment_date' => now()->toDateString(),
            'amount' => 100,
            'status' => 'confirmed',
            'created_by' => 'Test',
        ]);

        $response = $this->postJson("/api/sales-invoices/{$invoice->id}/returns", [
            'items' => [
                ['item_id' => $item->id, 'quantity' => 1],
            ],
            'refund_payment' => true,
        ]);

        $response->assertSuccessful();
        $invoice->refresh();
        $this->assertSame(50.0, (float) $invoice->paid_amount);
        $this->assertSame(50.0, (float) $invoice->balance_due);
        $this->assertDatabaseHas('sales_invoice_payments', [
            'sales_invoice_id' => $invoice->id,
            'status' => 'refunded',
            'amount' => 50,
        ]);
        $item->refresh();
        $this->assertSame(1, (int) $item->quantity);
        $this->assertSame(1, (int) $item->sold_quantity);
    }
}
