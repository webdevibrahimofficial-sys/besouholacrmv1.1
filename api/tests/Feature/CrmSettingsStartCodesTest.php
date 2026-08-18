<?php

namespace Tests\Feature;

use App\Models\CrmSetting;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CrmSettingsStartCodesTest extends TestCase
{
    use RefreshDatabase;

    private function makeTenantUser(string $slug, string $companyType = 'General'): array
    {
        $tenant = Tenant::factory()->create([
            'slug' => $slug,
            'company_type' => $companyType,
            'status' => 'active',
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);

        app()->instance('current_tenant_id', $tenant->id);

        return [$tenant, $user];
    }

    public function test_start_code_settings_persist(): void
    {
        [, $user] = $this->makeTenantUser('crm-start-codes-persist');
        Sanctum::actingAs($user);

        $payload = [
            'startCategoryCode' => 'CAT-0100',
            'startItemCode' => 'ITM-0200',
            'startUnitCode' => 'U-0300',
            'startProjectCode' => 'PRJ-0400',
            'startBrokerCode' => 'BRK-0500',
            'startCustomerCode' => 'C-0600',
            'startInvoiceCode' => 'INV-0700',
            'startOrderCode' => 'SO-0800',
            'startQuotationCode' => 'Q-0900',
        ];

        $this->withoutMiddleware()->putJson('/api/crm-settings', [
            'settings' => $payload,
        ])->assertOk();

        $this->withoutMiddleware()->getJson('/api/crm-settings')
            ->assertOk()
            ->assertJsonPath('settings.startCategoryCode', 'CAT-0100')
            ->assertJsonPath('settings.startItemCode', 'ITM-0200')
            ->assertJsonPath('settings.startUnitCode', 'U-0300')
            ->assertJsonPath('settings.startProjectCode', 'PRJ-0400')
            ->assertJsonPath('settings.startBrokerCode', 'BRK-0500')
            ->assertJsonPath('settings.startCustomerCode', 'C-0600')
            ->assertJsonPath('settings.startInvoiceCode', 'INV-0700')
            ->assertJsonPath('settings.startOrderCode', 'SO-0800')
            ->assertJsonPath('settings.startQuotationCode', 'Q-0900');
    }

    public function test_general_category_and_item_codes_use_crm_settings(): void
    {
        [, $user] = $this->makeTenantUser('crm-start-codes-general', 'General');
        Sanctum::actingAs($user);

        CrmSetting::create([
            'tenant_id' => $user->tenant_id,
            'settings' => [
                'startCategoryCode' => 'CAT-0100',
                'startItemCode' => 'ITM-0200',
                'startCustomerCode' => 'C-0600',
                'startInvoiceCode' => 'INV-0700',
                'startOrderCode' => 'SO-0800',
                'startQuotationCode' => 'Q-0900',
            ],
        ]);

        $category = $this->withoutMiddleware()->postJson('/api/item-categories', [
            'name' => 'Devices',
            'applies_to' => 'Products',
        ]);
        $category->assertCreated();
        $category->assertJsonPath('code', 'CAT-0100');

        $item = $this->withoutMiddleware()->postJson('/api/items', [
            'name' => 'Router',
            'brand' => 'TP-Link',
            'category_id' => $category->json('id'),
            'quantity' => 10,
            'min_alert' => 2,
            'price' => 100,
        ]);
        $item->assertCreated();
        $item->assertJsonPath('code', 'ITM-0200');

        $customer = $this->withoutMiddleware()->postJson('/api/customers', [
            'name' => 'General Customer',
            'phone' => '01012345678',
        ]);
        $customer->assertCreated();
        $this->assertSame('C-0600', $customer->json('customer_code') ?? $customer->json('data.customer_code'));

        $order = $this->withoutMiddleware()->postJson('/api/sales-orders', [
            'customer_name' => 'General Customer',
            'items' => [['name' => 'Router', 'quantity' => 1, 'price' => 100]],
            'total' => 100,
        ]);
        $order->assertCreated();
        $this->assertSame('SO-0800', $order->json('uuid') ?? $order->json('data.uuid'));

        $invoice = $this->withoutMiddleware()->postJson('/api/sales-invoices', [
            'customer_name' => 'General Customer',
            'issue_date' => '2026-08-18',
            'items' => [['name' => 'Router', 'quantity' => 1, 'price' => 100]],
            'total' => 100,
        ]);
        $invoice->assertCreated();
        $this->assertSame('INV-0700', $invoice->json('invoice_number') ?? $invoice->json('data.invoice_number'));

        $quotation = $this->withoutMiddleware()->postJson('/api/quotations', [
            'customer_name' => 'General Customer',
            'items' => [['name' => 'Router', 'quantity' => 1, 'price' => 100]],
            'total' => 100,
        ]);
        $quotation->assertCreated();
        $this->assertSame(
            'Q-0900',
            $quotation->json('meta_data.quotation_code') ?? $quotation->json('data.meta_data.quotation_code')
        );
    }

    public function test_real_estate_property_project_and_broker_codes_use_crm_settings(): void
    {
        [, $user] = $this->makeTenantUser('crm-start-codes-re', 'Real Estate');
        Sanctum::actingAs($user);

        CrmSetting::create([
            'tenant_id' => $user->tenant_id,
            'settings' => [
                'startUnitCode' => 'U-0300',
                'startProjectCode' => 'PRJ-0400',
                'startBrokerCode' => 'BRK-0500',
            ],
        ]);

        $property = $this->withoutMiddleware()->postJson('/api/properties', [
            'title' => 'Unit A',
        ]);
        $property->assertCreated();
        $this->assertSame('U-0300', $property->json('unit_code') ?? $property->json('data.unit_code'));

        $project = $this->withoutMiddleware()->postJson('/api/projects', [
            'name' => 'North Park',
        ]);
        $project->assertCreated();
        $this->assertSame('PRJ-0400', $project->json('code') ?? $project->json('data.code'));

        $broker = $this->withoutMiddleware()->postJson('/api/brokers', [
            'name' => 'Broker One',
        ]);
        $broker->assertCreated();
        $broker->assertJsonPath('code', 'BRK-0500');
    }
}
