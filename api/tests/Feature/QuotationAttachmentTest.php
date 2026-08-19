<?php

namespace Tests\Feature;

use App\Http\Controllers\QuotationController;
use App\Models\Quotation;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class QuotationAttachmentTest extends TestCase
{
    use RefreshDatabase;

    private function actingTenantUser(): User
    {
        $tenant = Tenant::factory()->create([
            'slug' => 'quotation-attachments',
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

    public function test_store_persists_quotation_attachment_in_meta_data(): void
    {
        $this->actingTenantUser();
        Storage::fake('public');
        $file = UploadedFile::fake()->create('offer.pdf', 20, 'application/pdf');

        $response = $this->withoutMiddleware()->post('/api/quotations', [
            'customer_name' => 'Test Tenant Customer',
            'status' => 'Draft',
            'items' => json_encode([['name' => 'Router', 'quantity' => 1, 'price' => 100]]),
            'subtotal' => 100,
            'total' => 114,
            'tax' => 14,
            'attachment' => $file,
        ]);

        $response->assertCreated();
        $quotation = Quotation::query()->findOrFail($response->json('id'));
        $this->assertNotEmpty(data_get($quotation->meta_data, 'attachment'));
        $this->assertSame('offer.pdf', data_get($quotation->meta_data, 'attachment_name'));
        Storage::disk('public')->assertExists(data_get($quotation->meta_data, 'attachment'));

        $list = app(QuotationController::class)->attachmentsIndex($quotation);
        $this->assertSame('offer.pdf', data_get($list->getData(true), '0.name'));
    }

    public function test_update_persists_quotation_attachment_without_wiping_meta(): void
    {
        $user = $this->actingTenantUser();
        Storage::fake('public');

        $quotation = Quotation::create([
            'tenant_id' => $user->tenant_id,
            'customer_name' => 'Existing Customer',
            'status' => 'Draft',
            'items' => [['name' => 'Router', 'quantity' => 1, 'price' => 100]],
            'subtotal' => 100,
            'total' => 100,
            'meta_data' => [
                'quotation_code' => 'Q-0100',
                'converted_from_request_id' => 9,
            ],
        ]);

        $file = UploadedFile::fake()->create('signed-offer.pdf', 12, 'application/pdf');
        $request = Request::create("/api/quotations/{$quotation->id}", 'POST', [
            'customer_name' => 'Existing Customer',
            'status' => 'Draft',
            'items' => json_encode([['name' => 'Router', 'quantity' => 1, 'price' => 100]]),
        ]);
        $request->files->set('attachment', $file);

        $response = app(QuotationController::class)->update($request, $quotation);
        $this->assertSame(200, $response->getStatusCode());

        $quotation->refresh();
        $this->assertSame('Q-0100', data_get($quotation->meta_data, 'quotation_code'));
        $this->assertSame(9, (int) data_get($quotation->meta_data, 'converted_from_request_id'));
        $this->assertSame('signed-offer.pdf', data_get($quotation->meta_data, 'attachment_name'));
        $this->assertNotEmpty(data_get($quotation->meta_data, 'attachment'));
        Storage::disk('public')->assertExists(data_get($quotation->meta_data, 'attachment'));
    }
}
