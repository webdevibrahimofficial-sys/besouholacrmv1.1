<?php

namespace Tests\Feature;

use App\Models\Integration;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaCapiTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    public function test_capi_test_endpoint_accepts_payload_in_mock_mode(): void
    {
        config(['services.meta.mock_mode' => true]);
        $this->seedSharedMetaApp();

        $tenant = Tenant::create([
            'id' => 'tenant_capi',
            'name' => 'Tenant CAPI',
            'slug' => 'tenant-capi',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
        ]);

        $response = $this->actingAs($user)->postJson('/api/meta/capi/test', [
            'pixel_id' => '1234567890',
            'event_name' => 'Lead',
            'event_time' => time(),
        ]);

        $response->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('mock', true);
    }

    public function test_capi_test_endpoint_uses_pixel_level_token_when_configured(): void
    {
        config(['services.meta.mock_mode' => false]);
        $this->seedSharedMetaApp('123456', 'shared-secret', 'verify-token');

        $tenant = Tenant::create([
            'id' => 'tenant_capi_pixel',
            'name' => 'Tenant CAPI Pixel',
            'slug' => 'tenant-capi-pixel',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
        ]);

        $secrets = app(\App\Services\IntegrationSecretsService::class);
        Integration::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'status' => 'active',
            'settings' => [
                'pixel_access_token' => $secrets->encryptSecret('pixel-level-token'),
            ],
        ]);

        $apiClient = \Mockery::mock(\App\Contracts\MetaApiClientInterface::class);
        $apiClient->shouldReceive('post')
            ->once()
            ->with('/1234567890/events', \Mockery::on(function (array $payload) {
                return ($payload['access_token'] ?? null) === 'pixel-level-token';
            }))
            ->andReturn(['events_received' => 1]);

        $this->app->instance(\App\Contracts\MetaApiClientInterface::class, $apiClient);

        $response = $this->actingAs($user)->postJson('/api/meta/capi/test', [
            'pixel_id' => '1234567890',
            'event_name' => 'Lead',
            'event_time' => time(),
        ]);

        $response->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonPath('token_source', 'pixel');
    }

    public function test_capi_token_resolver_reads_from_integrations_table(): void
    {
        $this->seedSharedMetaApp('123456', 'shared-secret', 'verify-token');

        $tenant = Tenant::create([
            'id' => 'tenant_capi_resolver',
            'name' => 'Tenant CAPI Resolver',
            'slug' => 'tenant-capi-resolver',
            'status' => 'active',
        ]);

        $secrets = app(\App\Services\IntegrationSecretsService::class);
        Integration::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'status' => 'active',
            'settings' => [
                'pixel_access_token' => $secrets->encryptSecret('resolver-pixel-token'),
            ],
        ]);

        $resolution = app(\App\Services\MetaCapiTokenResolver::class)->resolveForTenant($tenant->id);

        $this->assertSame('pixel', $resolution['source']);
        $this->assertSame('resolver-pixel-token', $resolution['token']);
    }
}
