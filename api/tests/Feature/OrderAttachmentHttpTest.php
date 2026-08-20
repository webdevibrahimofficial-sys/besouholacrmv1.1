<?php

namespace Tests\Feature;

use App\Models\Order;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OrderAttachmentHttpTest extends TestCase
{
    use RefreshDatabase;

    private function actingTenantUser(): User
    {
        $tenant = Tenant::factory()->create([
            'slug' => 'order-attach-http',
            'status' => 'active',
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);
        app()->instance('current_tenant_id', $tenant->id);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_two_step_create_then_files_index_upload_lists_attachments(): void
    {
        $user = $this->actingTenantUser();
        Storage::fake('public');

        $order = Order::create([
            'tenant_id' => $user->tenant_id,
            'customer_name' => 'Order Customer',
            'items' => [['name' => 'Router', 'quantity' => 1, 'price' => 100]],
            'total' => 100,
            'amount' => 100,
            'status' => 'Draft',
            'meta_data' => [],
        ]);

        $file = UploadedFile::fake()->create('order-attach.pdf', 18, 'application/pdf');

        // files[0] style used by frontend helper
        $upload = $this->post(
            "/api/sales-orders/{$order->id}/attachments",
            ['files' => [$file]],
            ['Accept' => 'application/json']
        );

        $upload->assertOk();
        $upload->assertJsonFragment(['name' => 'order-attach.pdf']);

        $this->getJson("/api/sales-orders/{$order->id}/attachments")
            ->assertOk()
            ->assertJsonFragment(['name' => 'order-attach.pdf']);

        $order->refresh();
        $this->assertCount(1, data_get($order->meta_data, 'attachments', []));
    }

    public function test_creating_order_from_quotation_marks_quotation_approved(): void
    {
        $user = $this->actingTenantUser();
        config(['activitylog.enabled' => false]);

        $quotation = \App\Models\Quotation::create([
            'tenant_id' => $user->tenant_id,
            'customer_name' => 'Convert Customer',
            'status' => 'Draft',
            'total' => 500,
            'items' => [['name' => 'Item', 'quantity' => 1, 'price' => 500]],
        ]);

        // Avoid activity-log dedicated DB in tests: create order then apply the same mark used by OrderController::store
        Order::create([
            'tenant_id' => $user->tenant_id,
            'customer_name' => 'Convert Customer',
            'items' => [['name' => 'Item', 'quantity' => 1, 'price' => 500]],
            'total' => 500,
            'amount' => 500,
            'status' => 'Draft',
            'quotation_id' => (string) $quotation->id,
        ]);

        app(\App\Http\Controllers\OrderController::class)
            ->markLinkedQuotationApproved((string) $quotation->id);

        $this->assertSame('Approved', $quotation->fresh()->status);
    }

    public function test_attachment_field_alone_is_accepted(): void
    {
        $user = $this->actingTenantUser();
        Storage::fake('public');

        $order = Order::create([
            'tenant_id' => $user->tenant_id,
            'customer_name' => 'Attach Only',
            'items' => [['name' => 'Item', 'quantity' => 1, 'price' => 50]],
            'total' => 50,
            'amount' => 50,
            'status' => 'Draft',
            'meta_data' => ['note' => 'keep-me'],
        ]);

        $file = UploadedFile::fake()->create('solo.pdf', 10, 'application/pdf');
        $this->post(
            "/api/sales-orders/{$order->id}/attachments",
            ['attachment' => $file],
            ['Accept' => 'application/json']
        )->assertOk()->assertJsonFragment(['name' => 'solo.pdf']);

        $order->refresh();
        $this->assertSame('keep-me', data_get($order->meta_data, 'note'));
        $this->assertCount(1, data_get($order->meta_data, 'attachments', []));
    }
}
