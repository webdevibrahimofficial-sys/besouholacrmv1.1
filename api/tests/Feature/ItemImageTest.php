<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\ItemCategory;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ItemImageTest extends TestCase
{
    use RefreshDatabase;

    public function test_item_image_is_stored_and_returned_as_url(): void
    {
        [$user, $category] = $this->makeProductContext();
        Sanctum::actingAs($user);
        Storage::fake('public');

        $file = UploadedFile::fake()->image('router.png', 80, 80);

        $response = $this->withoutMiddleware()->post('/api/items', [
            'name' => 'Router',
            'brand' => 'TP-Link',
            'code' => 'TPL-IMG-001',
            'category_id' => $category->id,
            'quantity' => 10,
            'price' => 500,
            'image' => $file,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('name', 'Router');
        $this->assertNotEmpty($response->json('image'));
        $this->assertStringStartsWith('/api/public-files/', (string) $response->json('image_url'));
        Storage::disk('public')->assertExists($response->json('image'));
    }

    public function test_item_image_can_be_saved_from_data_url(): void
    {
        [$user, $category] = $this->makeProductContext();
        Sanctum::actingAs($user);
        Storage::fake('public');

        $png = base64_encode(hex2bin('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100cf083d0d0000000049454e44ae426082') ?: '');

        $response = $this->withoutMiddleware()->postJson('/api/items', [
            'name' => 'Router',
            'brand' => 'TP-Link',
            'code' => 'TPL-IMG-002',
            'category_id' => $category->id,
            'quantity' => 10,
            'price' => 500,
            'image' => 'data:image/png;base64,'.$png,
        ]);

        $response->assertCreated();
        $this->assertNotEmpty($response->json('image'));
        Storage::disk('public')->assertExists($response->json('image'));
    }

    /**
     * @return array{0:User,1:ItemCategory}
     */
    private function makeProductContext(): array
    {
        $tenant = Tenant::factory()->create(['slug' => 'item-image']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $category = ItemCategory::create([
            'tenant_id' => $tenant->id,
            'name' => 'Networking',
            'applies_to' => 'Products',
        ]);

        return [$user, $category];
    }
}
