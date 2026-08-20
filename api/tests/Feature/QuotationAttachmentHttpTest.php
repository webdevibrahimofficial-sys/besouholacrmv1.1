<?php

namespace Tests\Feature;

use App\Models\Quotation;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * End-to-end HTTP coverage matching the SalesQuotations.jsx two-step flow:
 * JSON create/update, then multipart POST /quotations/{id}/attachments with files[].
 */
class QuotationAttachmentHttpTest extends TestCase
{
    use RefreshDatabase;

    private function actingTenantUser(): User
    {
        $tenant = Tenant::factory()->create([
            'slug' => 'quote-attach-http',
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

    public function test_frontend_two_step_create_then_files_bracket_upload_lists_attachments(): void
    {
        $this->actingTenantUser();
        Storage::fake('public');

        $create = $this->postJson('/api/quotations', [
            'customer_name' => 'HTTP Customer',
            'status' => 'Draft',
            'items' => [['name' => 'Router', 'quantity' => 1, 'price' => 100]],
            'subtotal' => 100,
            'total' => 114,
            'tax' => 14,
        ]);

        $create->assertCreated();
        $id = $create->json('id');
        $this->assertNotEmpty($id);

        $file = UploadedFile::fake()->create('offer.pdf', 20, 'application/pdf');

        // Mimic browser FormData.append('files[]', file)
        $upload = $this->post(
            "/api/quotations/{$id}/attachments",
            ['files' => [$file]],
            ['Accept' => 'application/json']
        );

        $upload->assertOk();
        $upload->assertJsonFragment(['name' => 'offer.pdf']);

        $list = $this->getJson("/api/quotations/{$id}/attachments");
        $list->assertOk();
        $list->assertJsonFragment(['name' => 'offer.pdf']);

        $quotation = Quotation::query()->findOrFail($id);
        $this->assertCount(1, data_get($quotation->meta_data, 'attachments', []));
        $this->assertSame('offer.pdf', data_get($quotation->meta_data, 'attachment_name'));

        $index = $this->getJson('/api/quotations?all=1');
        $index->assertOk();
        $row = collect($index->json())->firstWhere('id', $id);
        $this->assertNotNull($row);
        $this->assertNotEmpty(data_get($row, 'meta_data.attachments.0.name') ?? data_get($row, 'meta_data.attachment_name'));
    }

    public function test_edit_then_attach_file_preserves_existing_meta(): void
    {
        $user = $this->actingTenantUser();
        Storage::fake('public');

        $quotation = Quotation::create([
            'tenant_id' => $user->tenant_id,
            'customer_name' => 'Edit Customer',
            'status' => 'Draft',
            'items' => [['name' => 'Router', 'quantity' => 1, 'price' => 100]],
            'subtotal' => 100,
            'total' => 100,
            'meta_data' => [
                'quotation_code' => 'Q-0900',
                'converted_from_request_id' => 3,
            ],
        ]);

        $this->putJson("/api/quotations/{$quotation->id}", [
            'customer_name' => 'Edit Customer',
            'status' => 'Draft',
            'items' => [['name' => 'Router', 'quantity' => 1, 'price' => 100]],
            'notes' => 'updated',
        ])->assertOk();

        $file = UploadedFile::fake()->create('signed.pdf', 12, 'application/pdf');
        $this->post(
            "/api/quotations/{$quotation->id}/attachments",
            ['files' => [$file]],
            ['Accept' => 'application/json']
        )->assertOk();

        $quotation->refresh();
        $this->assertSame('Q-0900', data_get($quotation->meta_data, 'quotation_code'));
        $this->assertSame(3, (int) data_get($quotation->meta_data, 'converted_from_request_id'));
        $this->assertSame('signed.pdf', data_get($quotation->meta_data, 'attachment_name'));
        $this->assertCount(1, data_get($quotation->meta_data, 'attachments', []));
    }

    public function test_multipart_create_with_attachment_field_still_works(): void
    {
        $this->actingTenantUser();
        Storage::fake('public');

        $file = UploadedFile::fake()->create('legacy.pdf', 15, 'application/pdf');

        $response = $this->post('/api/quotations', [
            'customer_name' => 'Legacy Multipart',
            'status' => 'Draft',
            'items' => json_encode([['name' => 'Router', 'quantity' => 1, 'price' => 100]]),
            'subtotal' => 100,
            'total' => 114,
            'tax' => 14,
            'attachment' => $file,
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $id = $response->json('id');
        $quotation = Quotation::query()->findOrFail($id);
        $this->assertSame('legacy.pdf', data_get($quotation->meta_data, 'attachment_name'));
        $this->assertNotEmpty(data_get($quotation->meta_data, 'attachments'));

        $this->getJson("/api/quotations/{$id}/attachments")
            ->assertOk()
            ->assertJsonFragment(['name' => 'legacy.pdf']);
    }
}
