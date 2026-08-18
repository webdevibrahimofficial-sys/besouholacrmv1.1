<?php

namespace Tests\Feature;

use App\Models\ItemCategory;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ItemBusinessTypeValidationTest extends TestCase
{
    use RefreshDatabase;

    public function test_category_requires_name_and_type(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'category-required-type']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/item-categories', [
            'name' => 'Devices',
        ])->assertStatus(422);
    }

    public function test_category_stores_canonical_products_and_services_types(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'canonical-category-types']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        Sanctum::actingAs($user);

        $products = $this->withoutMiddleware()->postJson('/api/item-categories', [
            'name' => 'Devices',
            'applies_to' => 'Product',
        ]);
        $products->assertCreated();
        $products->assertJsonPath('applies_to', 'Products');
        $products->assertJsonPath('category_type', 'Products');
        $products->assertJsonPath('business_type', 'product');

        $services = $this->withoutMiddleware()->postJson('/api/item-categories', [
            'name' => 'Managed Packages',
            'category_type' => 'Package',
        ]);
        $services->assertCreated();
        $services->assertJsonPath('applies_to', 'Services');
        $services->assertJsonPath('category_type', 'Services');
        $services->assertJsonPath('business_type', 'service');
        $services->assertJsonPath('meta_data.general_inventory.item_form', 'service');
    }

    public function test_product_item_requires_quantity_and_brand(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'product-item-validation']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $category = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Devices',
            'applies_to' => 'Products',
        ]);

        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/items', [
            'name' => 'Router',
            'category_id' => $category->id,
            'price' => 750,
        ])->assertStatus(422)
            ->assertJsonValidationErrors(['quantity', 'brand']);
    }

    public function test_service_item_requires_billing_cycle_and_service_type(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'service-item-validation']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $category = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Subscriptions',
            'applies_to' => 'Services',
        ]);

        Sanctum::actingAs($user);

        $this->withoutMiddleware()->postJson('/api/items', [
            'name' => 'CRM Subscription',
            'category_id' => $category->id,
            'price' => 2000,
        ])->assertStatus(422);
    }

    public function test_service_item_is_tagged_with_business_type(): void
    {
        $tenant = Tenant::factory()->create(['slug' => 'service-item-business-type']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $category = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Subscriptions',
            'applies_to' => 'Services',
        ]);

        Sanctum::actingAs($user);

        $response = $this->withoutMiddleware()->postJson('/api/items', [
            'name' => 'CRM Subscription',
            'category_id' => $category->id,
            'price' => 2000,
            'billingCycle' => 'Monthly',
            'service_type' => 'Software',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('business_type', 'service');
        $response->assertJsonPath('category_type', 'Services');
        $response->assertJsonPath('type', 'Services');
        $response->assertJsonPath('meta_data.general_inventory.business_type', 'service');
        $response->assertJsonPath('meta_data.general_inventory.item_form', 'service');
    }
}
