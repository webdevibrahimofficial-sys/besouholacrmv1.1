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
}
