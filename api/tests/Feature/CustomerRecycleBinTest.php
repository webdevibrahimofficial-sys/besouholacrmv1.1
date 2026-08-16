<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerRecycleBinTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->app->make(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

        $this->tenant = Tenant::create([
            'name' => 'Test Tenant',
            'domain' => 'customer-recycle-tenant',
            'slug' => 'customer-recycle-tenant',
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
            'name' => 'Recycle Customer',
            'phone' => '010'.fake()->unique()->numerify('########'),
        ], $overrides));
    }

    public function test_admin_soft_deletes_customer_into_recycle_bin(): void
    {
        $admin = $this->makeUser(['job_title' => 'Admin']);
        Sanctum::actingAs($admin);

        $customer = $this->makeCustomer(['name' => 'Soft Delete Me']);

        $this->deleteJson("/api/customers/{$customer->id}")
            ->assertOk()
            ->assertJsonFragment(['message' => 'Customer moved to recycle bin successfully']);

        $this->assertSoftDeleted('customers', ['id' => $customer->id]);

        $trashed = Customer::withTrashed()->find($customer->id);
        $this->assertEquals($admin->id, $trashed->deleted_by);

        $this->getJson('/api/customers/recycle')
            ->assertOk()
            ->assertJsonFragment(['id' => $customer->id, 'name' => 'Soft Delete Me']);
    }

    public function test_director_without_permission_cannot_delete_customer(): void
    {
        $director = $this->makeUser([
            'job_title' => 'Director',
            'meta_data' => ['module_permissions' => ['Customers' => ['showModule', 'editInfo']]],
        ]);
        Sanctum::actingAs($director);

        $customer = $this->makeCustomer();

        $this->deleteJson("/api/customers/{$customer->id}")->assertForbidden();
        $this->assertNotSoftDeleted('customers', ['id' => $customer->id]);
        $this->getJson('/api/customers/recycle')->assertForbidden();
    }

    public function test_director_with_permission_can_delete_and_restore_but_not_force_delete(): void
    {
        $director = $this->makeUser([
            'job_title' => 'Director',
            'meta_data' => ['module_permissions' => ['Customers' => ['showModule', 'deleteCustomer']]],
        ]);
        Sanctum::actingAs($director);

        $customer = $this->makeCustomer(['name' => 'Director Recycle']);

        $this->deleteJson("/api/customers/{$customer->id}")->assertOk();
        $this->assertSoftDeleted('customers', ['id' => $customer->id]);

        $this->getJson('/api/customers/recycle')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Director Recycle']);

        $this->deleteJson("/api/customers/recycle/{$customer->id}")->assertForbidden();
        $this->assertSoftDeleted('customers', ['id' => $customer->id]);

        $this->postJson("/api/customers/recycle/{$customer->id}/restore")->assertOk();
        $this->assertNotSoftDeleted('customers', ['id' => $customer->id]);
    }

    public function test_admin_can_force_delete_customer(): void
    {
        $admin = $this->makeUser(['job_title' => 'Tenant Admin']);
        Sanctum::actingAs($admin);

        $customer = $this->makeCustomer(['name' => 'Gone Forever']);
        $customer->delete();

        $this->deleteJson("/api/customers/recycle/{$customer->id}")->assertOk();
        $this->assertDatabaseMissing('customers', ['id' => $customer->id]);
    }

    public function test_bulk_delete_restore_and_force_delete(): void
    {
        $admin = $this->makeUser(['job_title' => 'Admin']);
        Sanctum::actingAs($admin);

        $first = $this->makeCustomer(['name' => 'Bulk One']);
        $second = $this->makeCustomer(['name' => 'Bulk Two']);

        $this->postJson('/api/customers/bulk-delete', ['ids' => [$first->id, $second->id]])
            ->assertOk()
            ->assertJsonFragment(['count' => 2]);

        $this->assertSoftDeleted('customers', ['id' => $first->id]);
        $this->assertSoftDeleted('customers', ['id' => $second->id]);

        $this->postJson('/api/customers/bulk-restore', ['ids' => [$first->id]])
            ->assertOk()
            ->assertJsonFragment(['count' => 1]);

        $this->assertNotSoftDeleted('customers', ['id' => $first->id]);
        $this->assertSoftDeleted('customers', ['id' => $second->id]);

        $this->postJson('/api/customers/bulk-force-delete', ['ids' => [$second->id]])
            ->assertOk()
            ->assertJsonFragment(['count' => 1]);

        $this->assertDatabaseMissing('customers', ['id' => $second->id]);
    }

    public function test_operation_manager_without_permission_cannot_bulk_delete(): void
    {
        $ops = $this->makeUser([
            'job_title' => 'Operation Manager',
            'meta_data' => ['module_permissions' => ['Customers' => ['showModule']]],
        ]);
        Sanctum::actingAs($ops);

        $customer = $this->makeCustomer();

        $this->postJson('/api/customers/bulk-delete', ['ids' => [$customer->id]])->assertForbidden();
        $this->assertNotSoftDeleted('customers', ['id' => $customer->id]);
    }

    public function test_customer_manager_cannot_delete_even_with_stale_permission(): void
    {
        $manager = $this->makeUser([
            'job_title' => 'Customer Manager',
            'meta_data' => ['module_permissions' => ['Customers' => ['showModule', 'deleteCustomer']]],
        ]);
        Sanctum::actingAs($manager);

        $customer = $this->makeCustomer();

        $this->deleteJson("/api/customers/{$customer->id}")->assertForbidden();
        $this->postJson('/api/customers/bulk-delete', ['ids' => [$customer->id]])->assertForbidden();
        $this->getJson('/api/customers/recycle')->assertForbidden();
        $this->assertNotSoftDeleted('customers', ['id' => $customer->id]);
    }

    public function test_director_cannot_bulk_force_delete(): void
    {
        $director = $this->makeUser([
            'job_title' => 'Director',
            'meta_data' => ['module_permissions' => ['Customers' => ['deleteCustomer']]],
        ]);
        Sanctum::actingAs($director);

        $customer = $this->makeCustomer();
        $customer->delete();

        $this->postJson('/api/customers/bulk-force-delete', ['ids' => [$customer->id]])->assertForbidden();
        $this->assertSoftDeleted('customers', ['id' => $customer->id]);
    }
}
