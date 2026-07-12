<?php

namespace Tests\Feature;

use App\Models\Integration;
use App\Models\Tenant;
use App\Models\User;
use App\Services\MetaSystemSettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class SharedMetaAppSettingsTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    public function test_super_admin_can_save_shared_meta_app_settings(): void
    {
        $systemTenant = Tenant::create([
            'id' => 'system',
            'name' => 'System',
            'slug' => 'system',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $systemTenant->id,
            'is_super_admin' => true,
        ]);

        $save = $this->actingAs($user)->postJson('/api/super-admin/settings', [
            'settings' => [
                'meta_app_id' => '1234567890',
                'meta_app_secret' => 'my-secret-value',
                'meta_verify_token' => 'verify-token-value',
            ],
        ]);

        $save->assertOk();

        $this->assertDatabaseHas('system_settings', [
            'key' => MetaSystemSettingsService::KEY_APP_ID,
            'value' => '1234567890',
        ]);

        $show = $this->actingAs($user)->getJson('/api/super-admin/settings');
        $show->assertOk()
            ->assertJsonPath('meta_app_id', '1234567890')
            ->assertJsonPath('meta_verify_token', 'verify-token-value')
            ->assertJsonPath('meta_configured', true)
            ->assertJsonPath('meta_webhook_url', rtrim(config('app.url'), '/') . '/api/meta/webhook');

        $this->assertNotSame('my-secret-value', $show->json('meta_app_secret'));
    }

    public function test_global_webhook_verify_uses_shared_verify_token(): void
    {
        $this->seedSharedMetaApp('123456', 'shared-secret', 'token-123');

        $response = $this->get('/api/meta/webhook?hub.mode=subscribe&hub.verify_token=token-123&hub.challenge=abc');
        $response->assertOk();
        $response->assertSee('abc');
    }

    public function test_tenant_redirect_requires_shared_meta_app_configuration(): void
    {
        $tenant = Tenant::create([
            'id' => 'tenant_meta_redirect',
            'name' => 'Tenant Meta Redirect',
            'slug' => 'tenant-meta-redirect',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_super_admin' => true,
        ]);

        $redirect = $this->actingAs($user)->getJson('/api/auth/meta/redirect');
        $redirect->assertStatus(422)->assertJson([
            'error' => 'Meta integration is not enabled. Please ask your system administrator to configure the shared Meta App.',
        ]);

        $this->seedSharedMetaApp();

        config(['services.meta.mock_mode' => true]);

        $redirectAfterConfig = $this->actingAs($user)->getJson('/api/auth/meta/redirect');
        $redirectAfterConfig->assertOk()->assertJsonStructure(['url']);
    }

    public function test_meta_app_secret_is_encrypted_at_rest(): void
    {
        $this->seedSharedMetaApp('1234567890', 'plain-secret', 'verify-token');

        $stored = \App\Models\SystemSetting::where('key', MetaSystemSettingsService::KEY_APP_SECRET)->value('value');
        $this->assertNotSame('plain-secret', $stored);
        $this->assertSame('plain-secret', Crypt::decryptString($stored));
    }
}
