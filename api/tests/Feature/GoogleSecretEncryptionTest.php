<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\Tenant;
use App\Models\User;
use App\Services\GoogleAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GoogleSecretEncryptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_super_admin_google_client_secret_is_masked_and_encrypted_at_rest(): void
    {
        $systemTenant = Tenant::create([
            'id' => 'system',
            'name' => 'System',
            'slug' => 'system',
            'status' => 'active',
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $systemTenant->id,
            'is_super_admin' => true,
        ]);

        $save = $this->actingAs($admin)->postJson('/api/super-admin/settings', [
            'settings' => [
                'google_client_secret' => 'plain-google-secret',
            ],
        ]);

        $save->assertOk();

        $show = $this->actingAs($admin)->getJson('/api/super-admin/settings');
        $show->assertOk();

        $masked = $show->json('google_client_secret');
        $this->assertNotSame('plain-google-secret', $masked);
        $this->assertStringContainsString('*', (string) $masked);

        $stored = SystemSetting::where('key', 'google_client_secret')->value('value');
        $this->assertNotSame('plain-google-secret', $stored);

        $service = app(GoogleAuthService::class);
        $reflection = new \ReflectionClass($service);
        $property = $reflection->getProperty('clientSecret');
        $property->setAccessible(true);
        $this->assertSame('plain-google-secret', $property->getValue($service));
    }
}
