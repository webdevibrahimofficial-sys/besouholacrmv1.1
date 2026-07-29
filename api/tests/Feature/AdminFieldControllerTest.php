<?php

namespace Tests\Feature;

use App\Models\Entity;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminFieldControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_creates_supported_entity_when_missing(): void
    {
        $tenant = Tenant::create([
            'name' => 'Demo Tenant',
            'domain' => 'demo.localhost',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($user);

        $this->assertDatabaseMissing('entities', ['key' => 'leads']);

        $response = $this->postJson('/api/admin/fields', [
            'entity_key' => 'leads',
            'key' => 'lead_source',
            'label_en' => 'Lead Source',
            'label_ar' => 'Lead Source AR',
            'type' => 'text',
            'required' => false,
            'active' => true,
            'can_filter' => true,
            'is_landing_page' => false,
            'show_my_lead' => true,
            'show_sales' => true,
            'show_manager' => true,
            'is_exportable' => true,
            'options' => [],
        ]);

        $response->assertCreated()
            ->assertJsonFragment([
                'key' => 'lead_source',
                'label_en' => 'Lead Source',
            ]);

        $entity = Entity::where('key', 'leads')->first();

        $this->assertNotNull($entity);
        $this->assertDatabaseHas('fields', [
            'entity_id' => $entity->id,
            'tenant_id' => $tenant->id,
            'key' => 'lead_source',
            'label_en' => 'Lead Source',
        ]);
    }

    public function test_store_rejects_unknown_entity_key(): void
    {
        $tenant = Tenant::create([
            'name' => 'Demo Tenant',
            'domain' => 'demo.localhost',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/admin/fields', [
            'entity_key' => 'unknown-entity',
            'key' => 'custom_key',
            'label_en' => 'Custom Key',
            'label_ar' => 'Custom Key AR',
            'type' => 'text',
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['entity_key']);

        $this->assertDatabaseMissing('entities', ['key' => 'unknown-entity']);
    }
}
