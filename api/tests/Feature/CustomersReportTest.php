<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Order;
use App\Models\SalesInvoice;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomersReportTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->app->make(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

        $this->tenant = Tenant::create([
            'name' => 'Customers Report Tenant',
            'domain' => 'customers-report-tenant',
            'slug' => 'customers-report-tenant',
            'status' => 'active',
        ]);
    }

    private function makeUser(array $overrides = []): User
    {
        return User::factory()->create(array_merge([
            'tenant_id' => $this->tenant->id,
            'job_title' => 'Admin',
        ], $overrides));
    }

    private function makeCustomer(array $overrides = []): Customer
    {
        return Customer::create(array_merge([
            'tenant_id' => $this->tenant->id,
            'name' => 'Report Customer',
            'phone' => '010'.fake()->unique()->numerify('########'),
        ], $overrides));
    }

    public function test_report_separates_billed_collected_and_excludes_draft_cancelled(): void
    {
        $admin = $this->makeUser(['name' => 'Admin User']);
        Sanctum::actingAs($admin);

        $customer = $this->makeCustomer(['name' => 'Commercial Customer']);

        $confirmedOrder = Order::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Confirmed',
            'amount' => 2500,
            'total' => 2500,
        ]);
        $confirmedOrder->forceFill(['created_at' => '2026-03-01 10:00:00'])->save();
        Order::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Draft',
            'amount' => 8000,
            'total' => 8000,
        ]);
        Order::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Cancelled',
            'amount' => 5000,
            'total' => 5000,
        ]);

        SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Posted',
            'payment_status' => 'Partial',
            'total' => 1000,
            'paid_amount' => 400,
            'issue_date' => '2026-01-15',
            'items' => [
                ['name' => 'Unit A', 'total' => 700],
                ['name' => 'Unit B', 'total' => 300],
            ],
        ]);
        SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Draft',
            'payment_status' => 'Unpaid',
            'total' => 9999,
            'paid_amount' => 0,
            'items' => [
                ['name' => 'Draft Item', 'total' => 9999],
            ],
        ]);
        SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Cancelled',
            'payment_status' => 'Unpaid',
            'total' => 3000,
            'paid_amount' => 0,
        ]);

        $row = $this->getJson('/api/reports/customers?all=1')
            ->assertOk()
            ->json('data.0');

        $this->assertSame($customer->id, $row['id']);
        $this->assertEquals(1000, $row['billedTotal']);
        $this->assertEquals(400, $row['collectedTotal']);
        $this->assertEquals(400, $row['totalRevenue']);
        $this->assertEquals(600, $row['outstandingTotal']);
        $this->assertEquals(2500, $row['ordersTotal']);
        $this->assertEquals(1, $row['orders']);
        $this->assertEquals(1, $row['invoicesCount']);
        $this->assertEquals(1000, $row['invoicePartialTotal']);
        $this->assertEquals(400, $row['invoicePartialCollected']);
        $this->assertEquals(700, $row['revenueBreakdown']['Unit A']);
        $this->assertEquals(300, $row['revenueBreakdown']['Unit B']);
        $this->assertArrayNotHasKey('Draft Item', $row['revenueBreakdown']);
        $this->assertSame('2026-03-01', $row['lastActivity']);
    }

    public function test_report_filters_by_salesperson_on_the_server(): void
    {
        $salesA = $this->makeUser(['name' => 'Sales A']);
        $salesB = $this->makeUser(['name' => 'Sales B']);
        $admin = $this->makeUser(['name' => 'Admin User']);
        Sanctum::actingAs($admin);

        $this->makeCustomer([
            'name' => 'Customer A',
            'assigned_to' => $salesA->id,
        ]);
        $this->makeCustomer([
            'name' => 'Customer B',
            'assigned_to' => $salesB->id,
        ]);

        $this->getJson('/api/reports/customers?all=1&salesperson=Sales%20A')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Customer A');
    }

    public function test_report_includes_deferred_invoices_and_customer_address(): void
    {
        $admin = $this->makeUser(['name' => 'Admin User']);
        Sanctum::actingAs($admin);

        $customer = $this->makeCustomer([
            'name' => 'Deferred Customer',
            'source' => 'Facebook',
            'address' => 'Street 12, Nasr City',
            'city' => 'Cairo',
            'country' => 'Egypt',
        ]);

        SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'invoice_type' => 'Advance', // Deferred Payment (UI label)
            'status' => 'Posted',
            'payment_status' => 'Unpaid',
            'total' => 1500,
            'paid_amount' => 0,
            'issue_date' => '2026-04-01',
            'items' => [
                ['name' => 'Deferred Item', 'total' => 1500],
            ],
        ]);

        $row = $this->getJson('/api/reports/customers?all=1')
            ->assertOk()
            ->json('data.0');

        $this->assertSame($customer->id, $row['id']);
        $this->assertSame('Facebook', $row['source']);
        $this->assertSame('Street 12, Nasr City', $row['address']);
        $this->assertSame('Cairo', $row['city']);
        $this->assertSame('Egypt', $row['country']);
        $this->assertEquals(1500, $row['billedTotal']);
        $this->assertEquals(0, $row['collectedTotal']);
        $this->assertEquals(1500, $row['outstandingTotal']);
        $this->assertEquals(1, $row['invoicesCount']);
        $this->assertEquals(1500, $row['invoiceUnpaidTotal']);
        $this->assertEquals(1500, $row['revenueBreakdown']['Deferred Item']);
    }

    public function test_report_splits_quotation_statuses_like_customer_module(): void
    {
        $admin = $this->makeUser(['name' => 'Admin User']);
        Sanctum::actingAs($admin);

        $customer = $this->makeCustomer(['name' => 'Quote Customer']);

        \App\Models\Quotation::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => (string) $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Draft',
            'total' => 100,
            'items' => [],
        ]);
        \App\Models\Quotation::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => (string) $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Sent',
            'total' => 200,
            'items' => [],
        ]);
        \App\Models\Quotation::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => (string) $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Approved',
            'total' => 300,
            'items' => [],
        ]);
        \App\Models\Quotation::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => (string) $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Rejected',
            'total' => 50,
            'items' => [],
        ]);
        // Legacy Converted still maps to Approved bucket
        \App\Models\Quotation::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => (string) $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Converted',
            'total' => 80,
            'items' => [],
        ]);

        $row = $this->getJson('/api/reports/customers?all=1')
            ->assertOk()
            ->json('data.0');

        $this->assertEquals(5, $row['quotationTotal']);
        $this->assertEquals(1, $row['quotationDraft']);
        $this->assertEquals(1, $row['quotationSent']);
        $this->assertEquals(2, $row['quotationApproved']);
        $this->assertEquals(1, $row['quotationRejected']);
    }

    public function test_report_quotation_totals_include_orphans_and_code_linked_quotes(): void
    {
        $admin = $this->makeUser(['name' => 'Admin User']);
        Sanctum::actingAs($admin);

        $customer = $this->makeCustomer([
            'name' => 'Linked Customer',
            'customer_code' => 'CUST-100',
        ]);

        // Linked by numeric customer id (string column)
        \App\Models\Quotation::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => (string) $customer->id,
            'customer_name' => $customer->name,
            'status' => 'Draft',
            'total' => 10,
            'items' => [],
            'sales_person' => 'Admin User',
        ]);
        // Linked by customer_code stored in customer_id (common frontend pattern)
        \App\Models\Quotation::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => 'CUST-100',
            'customer_name' => $customer->name,
            'status' => 'Sent',
            'total' => 20,
            'items' => [],
            'sales_person' => 'Admin User',
        ]);
        // Orphan — no matching customer
        \App\Models\Quotation::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => null,
            'customer_name' => 'Unknown Walk-in',
            'status' => 'Approved',
            'total' => 30,
            'items' => [],
            'sales_person' => 'Admin User',
        ]);
        // Orphan — broken id
        \App\Models\Quotation::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => '999999',
            'customer_name' => 'Missing Customer',
            'status' => 'Rejected',
            'total' => 40,
            'items' => [],
            'sales_person' => 'Admin User',
        ]);

        $response = $this->getJson('/api/reports/customers?all=1')->assertOk();

        $row = $response->json('data.0');
        $this->assertNotNull($row);
        $this->assertEquals(2, $row['quotationTotal'], 'Per-customer row should match linked quotes only');
        $this->assertEquals(1, $row['quotationDraft']);
        $this->assertEquals(1, $row['quotationSent']);

        $totals = $response->json('quotation_totals');
        $this->assertNotNull($totals);
        $this->assertEquals(4, $totals['total'], 'KPI total must match Quotations page scope (linked + orphans)');
        $this->assertEquals(1, $totals['draft']);
        $this->assertEquals(1, $totals['sent']);
        $this->assertEquals(1, $totals['approved']);
        $this->assertEquals(1, $totals['rejected']);
        $this->assertEquals(2, $totals['orphan_total']);
    }

    public function test_report_order_totals_include_orphans_and_code_linked_orders(): void
    {
        $admin = $this->makeUser(['name' => 'Admin User']);
        Sanctum::actingAs($admin);

        $customer = $this->makeCustomer([
            'name' => 'Linked Order Customer',
            'customer_code' => 'CUST-ORD-100',
        ]);

        // Linked by numeric customer id
        Order::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'customer_code' => $customer->customer_code,
            'status' => 'Confirmed',
            'amount' => 100,
            'total' => 100,
            'sales_person' => 'Admin User',
        ]);
        // Linked by customer_code only (no customer_id) — common when code is chosen first
        Order::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => null,
            'customer_name' => $customer->name,
            'customer_code' => 'CUST-ORD-100',
            'status' => 'In Progress',
            'amount' => 200,
            'total' => 200,
            'sales_person' => 'Admin User',
        ]);
        // Orphan — no matching customer
        Order::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => null,
            'customer_name' => 'Unknown Walk-in',
            'customer_code' => null,
            'status' => 'Draft',
            'amount' => 300,
            'total' => 300,
            'sales_person' => 'Admin User',
        ]);
        // Orphan — broken / unmatched code (no FK customer)
        Order::create([
            'tenant_id' => $this->tenant->id,
            'customer_id' => null,
            'customer_name' => 'Missing Customer',
            'customer_code' => 'MISSING',
            'status' => 'Cancelled',
            'amount' => 400,
            'total' => 400,
            'sales_person' => 'Admin User',
        ]);

        $response = $this->getJson('/api/reports/customers?all=1')->assertOk();

        $row = $response->json('data.0');
        $this->assertNotNull($row);
        // Per-customer open orders only (excludes draft/cancelled); id + code linked
        $this->assertEquals(2, $row['orders'], 'Per-customer row should match linked open orders only');
        $this->assertEquals(300, $row['ordersTotal']);

        $totals = $response->json('order_totals');
        $this->assertNotNull($totals);
        $this->assertEquals(4, $totals['total'], 'KPI total must match Sales Orders page scope (linked + orphans, all statuses)');
        $this->assertEquals(2, $totals['open']);
        $this->assertEquals(1, $totals['draft']);
        $this->assertEquals(1, $totals['cancelled']);
        $this->assertEquals(2, $totals['orphan_total']);

        // Quotation totals fix must remain intact when orders are present
        $quoteTotals = $response->json('quotation_totals');
        $this->assertNotNull($quoteTotals);
        $this->assertArrayHasKey('total', $quoteTotals);
    }

    public function test_report_invoice_totals_include_orphans_and_code_linked_invoices(): void
    {
        $admin = $this->makeUser(['name' => 'Admin User']);
        Sanctum::actingAs($admin);

        $customer = $this->makeCustomer([
            'name' => 'Linked Invoice Customer',
            'customer_code' => 'CUST-INV-100',
        ]);

        // Linked by numeric customer id — paid posted
        SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'invoice_number' => 'INV-LINK-1',
            'customer_id' => $customer->id,
            'customer_name' => $customer->name,
            'customer_code' => $customer->customer_code,
            'status' => 'Posted',
            'payment_status' => 'paid',
            'total' => 100,
            'paid_amount' => 100,
            'items' => [],
            'issue_date' => now()->toDateString(),
            'sales_person' => 'Admin User',
        ]);
        // Linked by customer_code only (no customer_id) — unpaid posted
        SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'invoice_number' => 'INV-LINK-2',
            'customer_id' => null,
            'customer_name' => $customer->name,
            'customer_code' => 'CUST-INV-100',
            'status' => 'Sent',
            'payment_status' => 'unpaid',
            'total' => 200,
            'paid_amount' => 0,
            'items' => [],
            'issue_date' => now()->toDateString(),
            'sales_person' => 'Admin User',
        ]);
        // Orphan — draft (excluded from billed/posted KPIs, included in total)
        SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'invoice_number' => 'INV-ORPHAN-1',
            'customer_id' => null,
            'customer_name' => 'Unknown Walk-in',
            'customer_code' => null,
            'status' => 'Draft',
            'payment_status' => 'unpaid',
            'total' => 300,
            'paid_amount' => 0,
            'items' => [],
            'issue_date' => now()->toDateString(),
            'sales_person' => 'Admin User',
        ]);
        // Orphan — broken code, partial posted
        SalesInvoice::create([
            'tenant_id' => $this->tenant->id,
            'invoice_number' => 'INV-ORPHAN-2',
            'customer_id' => null,
            'customer_name' => 'Missing Customer',
            'customer_code' => 'MISSING',
            'status' => 'Posted',
            'payment_status' => 'partial',
            'total' => 400,
            'paid_amount' => 150,
            'items' => [],
            'issue_date' => now()->toDateString(),
            'sales_person' => 'Admin User',
        ]);

        $response = $this->getJson('/api/reports/customers?all=1')->assertOk();

        $row = $response->json('data.0');
        $this->assertNotNull($row);
        // Per-customer posted invoices only (id + code linked); draft orphan excluded
        $this->assertEquals(2, $row['invoicesCount'], 'Per-customer row should match linked posted invoices only');
        $this->assertEquals(300, $row['billedTotal']);
        $this->assertEquals(100, $row['collectedTotal']);

        $totals = $response->json('invoice_totals');
        $this->assertNotNull($totals);
        $this->assertEquals(4, $totals['total'], 'KPI total must match Sales Invoices page scope (linked + orphans, all statuses)');
        $this->assertEquals(3, $totals['posted']);
        $this->assertEquals(700, $totals['billed']); // 100 + 200 + 400 (draft excluded)
        $this->assertEquals(250, $totals['collected']); // 100 + 0 + 150
        $this->assertEquals(100, $totals['paid_total']);
        $this->assertEquals(400, $totals['partial_total']);
        $this->assertEquals(200, $totals['unpaid_total']);
        $this->assertEquals(2, $totals['orphan_total']);

        // Order / quotation totals keys must remain present
        $this->assertArrayHasKey('total', $response->json('order_totals') ?? []);
        $this->assertArrayHasKey('total', $response->json('quotation_totals') ?? []);
    }
}
