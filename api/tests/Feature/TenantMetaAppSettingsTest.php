<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TenantMetaApp;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TenantMetaAppSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_tenant_can_create_and_read_meta_app_settings(): void
    {
        $tenant = Tenant::create([
            'id' => 'tenant_meta_settings',
            'name' => 'Tenant Meta Settings',
            'slug' => 'tenant-meta-settings',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_super_admin' => true,
        ]);

        $save = $this->actingAs($user)->putJson('/api/auth/meta/app-settings', [
            'app_id' => '1234567890',
            'app_secret' => 'my-secret-value',
            'verify_token' => 'verify-token-value',
            'is_active' => true,
        ]);

        $save->assertOk();

        $this->assertDatabaseHas('tenant_meta_apps', [
            'tenant_id' => $tenant->id,
            'app_id' => '1234567890',
            'is_active' => 1,
        ]);

        $show = $this->actingAs($user)->getJson('/api/auth/meta/app-settings');
        $show->assertOk()->assertJsonStructure([
            'app_id',
            'app_secret_masked',
            'verify_token_set',
            'webhook_key',
            'webhook_url',
            'is_active',
            'source',
        ]);
    }

    public function test_webhook_verify_works_with_tenant_webhook_key(): void
    {
        $tenant = Tenant::create([
            'id' => 'tenant_meta_webhook',
            'name' => 'Tenant Meta Webhook',
            'slug' => 'tenant-meta-webhook',
            'status' => 'active',
        ]);

        TenantMetaApp::create([
            'tenant_id' => $tenant->id,
            'app_id' => '123456',
            'app_secret' => 'my-secret',
            'verify_token' => 'token-123',
            'webhook_key' => 'tenant_webhook_key_123',
            'is_active' => true,
        ]);

        $response = $this->get('/api/meta/webhook/tenant_webhook_key_123?hub.mode=subscribe&hub.verify_token=token-123&hub.challenge=abc');
        $response->assertOk();
        $response->assertSee('abc');
    }
}
