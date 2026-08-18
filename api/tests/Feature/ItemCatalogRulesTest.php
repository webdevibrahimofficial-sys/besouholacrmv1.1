<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\ItemCategory;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use App\Services\GeneralInventory\GeneralInventoryOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ItemCatalogRulesTest extends TestCase
{
    use RefreshDatabase;

    public function test_product_item_saves_when_optional_catalog_fields_are_empty(): void
    {
        [$user, $category] = $this->makeProductContext('empty-optional-catalog');
        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($category->id, [
            'taxRate' => '',
            'startDate' => '',
            'endDate' => '',
            'maxDiscount' => '',
            'barcode' => '',
            'notes' => '',
        ]))->assertCreated()
            ->assertJsonPath('brand', 'TP-Link');
    }

    public function test_product_item_code_must_be_unique_per_tenant(): void
    {
        [$user, $category] = $this->makeProductContext('unique-item-code');
        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($category->id, [
            'name' => 'iPhone 15',
            'code' => 'APPLE-IPH15-128',
        ]))->assertCreated();

        $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($category->id, [
            'name' => 'iPhone 15 Duplicate',
            'code' => 'APPLE-IPH15-128',
        ]))->assertStatus(422)
            ->assertJsonValidationErrors(['code']);
    }

    public function test_product_is_low_stock_when_quantity_reaches_minimum(): void
    {
        [$user, $category] = $this->makeProductContext('low-stock-item');
        Sanctum::actingAs($user);

        $response = $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($category->id, [
            'quantity' => 5,
            'min_alert' => 5,
        ]));

        $response->assertCreated();
        $response->assertJsonPath('is_low_stock', true);
        $response->assertJsonPath('available_quantity', 5);
    }

    public function test_product_can_be_created_without_min_alert(): void
    {
        [$user, $category] = $this->makeProductContext('optional-min-alert');
        Sanctum::actingAs($user);

        $payload = $this->productPayload($category->id, [
            'code' => 'TPL-AX55-NO-MIN',
        ]);
        unset($payload['min_alert']);

        $response = $this->withoutMiddleware()->postJson('/api/items', $payload);

        $response->assertCreated();
        $response->assertJsonPath('min_alert', 0);
        $response->assertJsonPath('is_low_stock', false);
    }

    public function test_product_is_not_low_stock_when_min_alert_is_zero(): void
    {
        [$user, $category] = $this->makeProductContext('zero-min-alert');
        Sanctum::actingAs($user);

        $response = $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($category->id, [
            'code' => 'TPL-AX55-ZERO-MIN',
            'quantity' => 0,
            'min_alert' => 0,
        ]));

        $response->assertCreated();
        $response->assertJsonPath('is_low_stock', false);
    }

    public function test_service_addon_stores_period_and_adds_amount_to_total(): void
    {
        [$user, $category] = $this->makeServiceContext('service-addon-period');
        Sanctum::actingAs($user);

        $response = $this->withoutMiddleware()->postJson('/api/items', $this->servicePayload($category->id, [
            'code' => 'CRM-ADDON-PERIOD-1',
            'addons' => [[
                'name' => 'Priority Support',
                'period' => 'Monthly',
                'price' => 250,
            ]],
        ]));

        $response->assertCreated();
        $response->assertJsonPath('addons.0.name', 'Priority Support');
        $response->assertJsonPath('addons.0.period', 'Monthly');
        $response->assertJsonPath('addons.0.quantity', 1);
        $response->assertJsonPath('addons_total_price', 250);
        $response->assertJsonPath('total_price', 10250);

        $this->assertDatabaseHas('item_addons', [
            'name' => 'Priority Support',
            'period' => 'Monthly',
            'quantity' => 1,
        ]);
    }

    public function test_inventory_search_matches_code_brand_and_model(): void
    {
        [$user, $category] = $this->makeProductContext('search-item-catalog');
        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($category->id, [
            'name' => 'Galaxy Tab',
            'code' => 'SAM-TAB-001',
            'brand' => 'Samsung',
            'model' => 'S9',
            'barcode' => '8801234567890',
        ]))->assertCreated();

        $this->withoutMiddleware()->getJson('/api/items?all=1&search=SAM-TAB-001')
            ->assertOk()
            ->assertJsonFragment(['code' => 'SAM-TAB-001']);

        $this->withoutMiddleware()->getJson('/api/items?all=1&search=Samsung')
            ->assertOk()
            ->assertJsonFragment(['brand' => 'Samsung']);

        $this->withoutMiddleware()->getJson('/api/items?all=1&search=S9')
            ->assertOk()
            ->assertJsonFragment(['model' => 'S9']);
    }

    public function test_item_list_name_filter_matches_item_name_only(): void
    {
        [$user, $category] = $this->makeProductContext('name-filter-items');
        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($category->id, [
            'name' => 'Office Router',
            'code' => 'TPL-NAME-001',
            'brand' => 'Samsung',
            'model' => 'AX55',
        ]))->assertCreated();

        $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($category->id, [
            'name' => 'Galaxy Tab',
            'code' => 'SAM-TAB-NAME',
            'brand' => 'TP-Link',
        ]))->assertCreated();

        $byName = $this->withoutMiddleware()->getJson('/api/items?all=1&name=Galaxy');
        $byName->assertOk();
        $nameRows = $this->itemListRows($byName);
        $this->assertSame(['Galaxy Tab'], collect($nameRows)->pluck('name')->values()->all());

        $brandAsName = $this->withoutMiddleware()->getJson('/api/items?all=1&name=Samsung');
        $brandAsName->assertOk();
        $this->assertSame([], collect($this->itemListRows($brandAsName))->pluck('name')->values()->all());

        $bySearch = $this->withoutMiddleware()->getJson('/api/items?all=1&search=Samsung');
        $bySearch->assertOk();
        $this->assertTrue(
            collect($this->itemListRows($bySearch))->pluck('name')->contains('Office Router')
        );
    }

    public function test_item_list_filters_by_service_type_brand_code_and_low_stock(): void
    {
        [$user, $productCategory] = $this->makeProductContext('extra-item-list-filters');
        Sanctum::actingAs($user);

        $serviceCategory = ItemCategory::create([
            'tenant_id' => $user->tenant_id,
            'name' => 'Software Services',
            'applies_to' => 'Services',
        ]);

        $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($productCategory->id, [
            'name' => 'Low Stock Camera',
            'code' => 'CAM-LOW-1',
            'brand' => 'Hikvision',
            'quantity' => 2,
            'min_alert' => 5,
        ]))->assertCreated();

        $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($productCategory->id, [
            'name' => 'Plenty Camera',
            'code' => 'CAM-OK-1',
            'brand' => 'Dahua',
            'quantity' => 20,
            'min_alert' => 5,
        ]))->assertCreated();

        $this->withoutMiddleware()->postJson('/api/items', $this->servicePayload($serviceCategory->id, [
            'name' => 'Cloud Backup',
            'code' => 'CLOUD-BKP-1',
            'service_type' => 'Hosting',
        ]))->assertCreated();

        $byBrand = $this->withoutMiddleware()->getJson('/api/items?all=1&brand=Hikvision');
        $byBrand->assertOk();
        $this->assertSame(['Low Stock Camera'], collect($this->itemListRows($byBrand))->pluck('name')->values()->all());

        $byCode = $this->withoutMiddleware()->getJson('/api/items?all=1&code=CAM-OK');
        $byCode->assertOk();
        $this->assertSame(['Plenty Camera'], collect($this->itemListRows($byCode))->pluck('name')->values()->all());

        $byServiceType = $this->withoutMiddleware()->getJson('/api/items?all=1&service_type=Hosting');
        $byServiceType->assertOk();
        $this->assertSame(['Cloud Backup'], collect($this->itemListRows($byServiceType))->pluck('name')->values()->all());

        $lowStock = $this->withoutMiddleware()->getJson('/api/items?all=1&low_stock=1');
        $lowStock->assertOk();
        $this->assertSame(['Low Stock Camera'], collect($this->itemListRows($lowStock))->pluck('name')->values()->all());
    }

    public function test_item_list_filters_by_start_end_and_creation_date(): void
    {
        [$user, $category] = $this->makeServiceContext('item-date-filters');
        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/items', $this->servicePayload($category->id, [
            'name' => 'Spring Hosting',
            'code' => 'HOST-SPRING-1',
            'service_start_date' => '2026-03-01',
            'service_end_date' => '2026-08-31',
        ]))->assertCreated();

        $this->withoutMiddleware()->postJson('/api/items', $this->servicePayload($category->id, [
            'name' => 'Winter Hosting',
            'code' => 'HOST-WINTER-1',
            'service_start_date' => '2026-11-01',
            'service_end_date' => '2027-01-31',
        ]))->assertCreated();

        Item::query()->where('code', 'HOST-SPRING-1')->update(['created_at' => '2026-02-10 09:00:00']);
        Item::query()->where('code', 'HOST-WINTER-1')->update(['created_at' => '2026-10-20 09:00:00']);

        $byStart = $this->withoutMiddleware()->getJson('/api/items?all=1&start_date=2026-03-01');
        $byStart->assertOk();
        $this->assertSame(['Spring Hosting'], collect($this->itemListRows($byStart))->pluck('name')->values()->all());

        $byEnd = $this->withoutMiddleware()->getJson('/api/items?all=1&end_date=2027-01-31');
        $byEnd->assertOk();
        $this->assertSame(['Winter Hosting'], collect($this->itemListRows($byEnd))->pluck('name')->values()->all());

        $byCreated = $this->withoutMiddleware()->getJson('/api/items?all=1&created_at=2026-10-20');
        $byCreated->assertOk();
        $this->assertSame(['Winter Hosting'], collect($this->itemListRows($byCreated))->pluck('name')->values()->all());

        $byCreatedRange = $this->withoutMiddleware()->getJson('/api/items?all=1&created_from=2026-02-01&created_to=2026-03-01');
        $byCreatedRange->assertOk();
        $this->assertSame(['Spring Hosting'], collect($this->itemListRows($byCreatedRange))->pluck('name')->values()->all());

        $byCreatedFromOnly = $this->withoutMiddleware()->getJson('/api/items?all=1&created_from=2026-10-01');
        $byCreatedFromOnly->assertOk();
        $this->assertSame(['Winter Hosting'], collect($this->itemListRows($byCreatedFromOnly))->pluck('name')->values()->all());

        $byCreatedToOnly = $this->withoutMiddleware()->getJson('/api/items?all=1&created_to=2026-03-01');
        $byCreatedToOnly->assertOk();
        $this->assertSame(['Spring Hosting'], collect($this->itemListRows($byCreatedToOnly))->pluck('name')->values()->all());
    }

    public function test_service_billing_type_is_classified_as_recurring_or_one_time(): void
    {
        [$user, $category] = $this->makeServiceContext('service-billing-kind');
        Sanctum::actingAs($user);

        $monthly = $this->withoutMiddleware()->postJson('/api/items', $this->servicePayload($category->id, [
            'billingCycle' => 'Monthly',
        ]));
        $monthly->assertCreated();
        $monthly->assertJsonPath('billing_kind', 'recurring');
        $monthly->assertJsonPath('is_recurring', true);
        $monthly->assertJsonPath('service_amount', 10000);

        $oneTime = $this->withoutMiddleware()->postJson('/api/items', $this->servicePayload($category->id, [
            'name' => 'Website Design',
            'code' => 'WEB-DESIGN-1',
            'billingCycle' => 'One-time',
        ]));
        $oneTime->assertCreated();
        $oneTime->assertJsonPath('billing_kind', 'non_recurring');
        $oneTime->assertJsonPath('is_recurring', false);
    }

    public function test_order_amount_does_not_change_catalog_service_amount(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'catalog-vs-order-amount']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $category = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Software',
            'applies_to' => 'Services',
        ]);
        $item = Item::create([
            'tenant_id' => $tenant->id,
            'category_id' => $category->id,
            'name' => 'CRM Subscription',
            'code' => 'CRM-10000',
            'price' => 10000,
            'billing_cycle' => 'Monthly',
            'service_type' => 'Software',
        ]);
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'assigned_to' => $user->id,
            'created_by' => $user->id,
        ]);

        $order = app(GeneralInventoryOrderService::class)->syncFromReservation($lead, [
            'reservationGeneralItems' => [[
                'item' => $item->id,
                'quantity' => 1,
                'price' => 9000,
                'discount_amount' => 0,
                'billing_type' => 'Monthly',
            ]],
        ], 88, $user);

        $this->assertSame(10000.0, (float) $item->fresh()->price);
        $this->assertSame(9000.0, (float) $order->lines->first()->unit_price);
        $this->assertSame(10000.0, (float) ($order->lines->first()->meta_data['item_snapshot']['catalog_amount'] ?? 0));
        $this->assertSame(9000.0, (float) ($order->lines->first()->meta_data['item_snapshot']['order_unit_price'] ?? 0));
    }

    public function test_service_types_are_admin_customizable(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'custom-service-types']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        Sanctum::actingAs($user);

        $list = $this->withoutMiddleware()->getJson('/api/inventory-lookups/service-types');
        $list->assertOk();
        $this->assertTrue(collect($list->json())->contains(fn ($row) => ($row['name'] ?? '') === 'Consulting'));

        $this->withoutMiddleware()->postJson('/api/inventory-lookups/service-types', [
            'name' => 'Implementation',
        ])->assertCreated();
    }

    public function test_service_item_accepts_custom_service_type_string(): void
    {
        [$user, $category] = $this->makeServiceContext('custom-service-type-item');
        Sanctum::actingAs($user);

        $response = $this->withoutMiddleware()->postJson('/api/items', $this->servicePayload($category->id, [
            'name' => 'On-site Implementation',
            'code' => 'IMPL-CUSTOM-1',
            'service_type' => 'Field Implementation',
        ]));

        $response->assertCreated();
        $response->assertJsonPath('service_type', 'Field Implementation');

        $this->assertDatabaseHas('items', [
            'code' => 'IMPL-CUSTOM-1',
            'service_type' => 'Field Implementation',
        ]);

        $lookups = $this->withoutMiddleware()->getJson('/api/inventory-lookups/service-types');
        $lookups->assertOk();
        $this->assertTrue(
            collect($lookups->json())->contains(fn ($row) => ($row['name'] ?? '') === 'Field Implementation')
        );
    }

    public function test_item_list_can_be_filtered_by_category_type(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'filter-items-by-category-type']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        Sanctum::actingAs($user);

        $productCategory = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Devices',
            'applies_to' => 'Products',
        ]);
        $serviceCategory = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Subscriptions',
            'applies_to' => 'Services',
        ]);

        $this->withoutMiddleware()->postJson('/api/items', $this->productPayload($productCategory->id, [
            'name' => 'Office Router',
            'code' => 'PROD-FILTER-1',
        ]))->assertCreated();

        $this->withoutMiddleware()->postJson('/api/items', $this->servicePayload($serviceCategory->id, [
            'name' => 'Managed WiFi',
            'code' => 'SRV-FILTER-1',
        ]))->assertCreated();

        $products = $this->itemListRows(
            $this->withoutMiddleware()->getJson('/api/items?all=1&category_type=Products')
        );
        $this->assertNotEmpty($products);
        $this->assertTrue(collect($products)->every(fn ($row) => ($row['category_type'] ?? null) === 'Products'));
        $this->assertTrue(collect($products)->contains(fn ($row) => ($row['code'] ?? null) === 'PROD-FILTER-1'));
        $this->assertFalse(collect($products)->contains(fn ($row) => ($row['code'] ?? null) === 'SRV-FILTER-1'));

        $services = $this->itemListRows(
            $this->withoutMiddleware()->getJson('/api/items?all=1&category_type=Services')
        );
        $this->assertNotEmpty($services);
        $this->assertTrue(collect($services)->every(fn ($row) => ($row['category_type'] ?? null) === 'Services'));
        $this->assertTrue(collect($services)->contains(fn ($row) => ($row['code'] ?? null) === 'SRV-FILTER-1'));
        $this->assertFalse(collect($services)->contains(fn ($row) => ($row['code'] ?? null) === 'PROD-FILTER-1'));

        $byBusinessType = $this->itemListRows(
            $this->withoutMiddleware()->getJson('/api/items?all=1&business_type=service')
        );
        $this->assertTrue(collect($byBusinessType)->every(fn ($row) => ($row['business_type'] ?? null) === 'service'));
        $this->assertTrue(collect($byBusinessType)->contains(fn ($row) => ($row['code'] ?? null) === 'SRV-FILTER-1'));
        $this->assertFalse(collect($byBusinessType)->contains(fn ($row) => ($row['code'] ?? null) === 'PROD-FILTER-1'));
    }

    public function test_item_list_includes_service_catalog_fields(): void
    {
        [$user, $category] = $this->makeServiceContext('list-service-catalog-fields');
        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/items', $this->servicePayload($category->id, [
            'name' => 'Car Wash Subscription',
            'code' => 'WASH-SUB-1',
            'service_type' => 'Software',
            'billingCycle' => 'Subscription',
        ]))->assertCreated();

        $list = $this->withoutMiddleware()->getJson('/api/items?all=1');
        $list->assertOk();

        $rows = $list->json();
        if (! is_array($rows) || (isset($rows['data']) && is_array($rows['data']))) {
            $rows = $list->json('data') ?? [];
        }

        $row = collect($rows)->firstWhere('code', 'WASH-SUB-1');
        $this->assertNotNull($row);
        $this->assertSame('Car Wash Subscription', $row['name'] ?? null);
        $this->assertSame('Software', $row['service_type'] ?? null);
        $this->assertSame('Subscription', $row['billing_cycle'] ?? null);
        $this->assertSame('service', $row['business_type'] ?? null);
        $this->assertSame('Services', $row['category_type'] ?? null);
    }

    /**
     * @return array{0:User,1:ItemCategory}
     */
    private function makeProductContext(string $slug): array
    {
        $tenant = Tenant::factory()->create(['slug' => $slug]);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $category = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Devices',
            'applies_to' => 'Products',
        ]);

        return [$user, $category];
    }

    /**
     * @return array{0:User,1:ItemCategory}
     */
    private function makeServiceContext(string $slug): array
    {
        $tenant = Tenant::factory()->create(['slug' => $slug]);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $category = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Services',
            'applies_to' => 'Services',
        ]);

        return [$user, $category];
    }

    /**
     * @param  array<string,mixed>  $overrides
     * @return array<string,mixed>
     */
    private function productPayload(int $categoryId, array $overrides = []): array
    {
        return array_merge([
            'name' => 'Router',
            'brand' => 'TP-Link',
            'model' => 'AX55',
            'code' => 'TPL-AX55-001',
            'category_id' => $categoryId,
            'quantity' => 20,
            'min_alert' => 5,
            'price' => 750,
        ], $overrides);
    }

    /**
     * @param  array<string,mixed>  $overrides
     * @return array<string,mixed>
     */
    private function servicePayload(int $categoryId, array $overrides = []): array
    {
        return array_merge([
            'name' => 'CRM Subscription',
            'category_id' => $categoryId,
            'price' => 10000,
            'billingCycle' => 'Monthly',
            'service_type' => 'Software',
            'code' => 'CRM-SUB-1',
        ], $overrides);
    }

    /**
     * @return list<array<string,mixed>>
     */
    private function itemListRows($response): array
    {
        $rows = $response->json();
        if (is_array($rows) && isset($rows['data']) && is_array($rows['data']) && ! array_is_list($rows)) {
            return $rows['data'];
        }

        return is_array($rows) ? $rows : [];
    }
}
