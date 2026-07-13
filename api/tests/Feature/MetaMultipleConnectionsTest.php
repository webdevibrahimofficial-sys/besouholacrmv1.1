<?php

namespace Tests\Feature;

use App\Contracts\MetaApiClientInterface;
use App\Models\MetaConnection;
use App\Models\Tenant;
use App\Services\MetaAccessTokenService;
use App\Services\MetaAuthService;
use App\Services\MetaCapiService;
use App\Services\MetaLeadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class MetaMultipleConnectionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_tenant_can_store_multiple_meta_connections_for_different_facebook_users(): void
    {
        $tenant = Tenant::create([
            'name' => 'Meta Multi Tenant',
            'slug' => 'meta-multi-tenant',
            'status' => 'active',
        ]);

        MetaConnection::updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'fb_user_id' => 'fb-user-1',
            ],
            [
                'user_access_token' => 'token-1',
                'name' => 'First User',
                'email' => 'first@example.com',
            ]
        );

        MetaConnection::updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'fb_user_id' => 'fb-user-2',
            ],
            [
                'user_access_token' => 'token-2',
                'name' => 'Second User',
                'email' => 'second@example.com',
            ]
        );

        $this->assertSame(2, MetaConnection::where('tenant_id', $tenant->id)->count());
        $this->assertDatabaseHas('meta_connections', [
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'email' => 'first@example.com',
        ]);
        $this->assertDatabaseHas('meta_connections', [
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-2',
            'email' => 'second@example.com',
        ]);
    }

    public function test_reconnecting_same_facebook_user_updates_existing_connection_without_deleting_other_connections(): void
    {
        $tenant = Tenant::create([
            'name' => 'Meta Reconnect Tenant',
            'slug' => 'meta-reconnect-tenant',
            'status' => 'active',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'token-1',
            'name' => 'First User',
            'email' => 'first@example.com',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-2',
            'user_access_token' => 'token-2',
            'name' => 'Second User',
            'email' => 'second@example.com',
        ]);

        MetaConnection::updateOrCreate(
            [
                'tenant_id' => $tenant->id,
                'fb_user_id' => 'fb-user-1',
            ],
            [
                'user_access_token' => 'token-1-updated',
                'name' => 'First User Updated',
                'email' => 'first-updated@example.com',
            ]
        );

        $this->assertSame(2, MetaConnection::where('tenant_id', $tenant->id)->count());
        $this->assertDatabaseHas('meta_connections', [
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'email' => 'first-updated@example.com',
        ]);
        $this->assertDatabaseHas('meta_connections', [
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-2',
            'email' => 'second@example.com',
        ]);
    }

    public function test_meta_auth_service_does_not_choose_arbitrary_token_when_multiple_valid_connections_exist(): void
    {
        $tenant = Tenant::create([
            'name' => 'Meta Ambiguous Token Tenant',
            'slug' => 'meta-ambiguous-token-tenant',
            'status' => 'active',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'token-1',
            'name' => 'First User',
            'email' => 'first@example.com',
            'expires_at' => now()->addDays(30),
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-2',
            'user_access_token' => 'token-2',
            'name' => 'Second User',
            'email' => 'second@example.com',
            'expires_at' => now()->addDays(30),
        ]);

        $service = app(MetaAuthService::class);

        $this->assertNull($service->getAccessToken($tenant->id));
    }

    public function test_meta_lead_service_skips_ambiguous_fallback_without_page_context(): void
    {
        $tenant = Tenant::create([
            'name' => 'Meta Ambiguous Lead Tenant',
            'slug' => 'meta-ambiguous-lead-tenant',
            'status' => 'active',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'token-1',
            'name' => 'First User',
            'email' => 'first@example.com',
            'expires_at' => now()->addDays(30),
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-2',
            'user_access_token' => 'token-2',
            'name' => 'Second User',
            'email' => 'second@example.com',
            'expires_at' => now()->addDays(30),
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldNotReceive('get');

        $accessTokenService = Mockery::mock(MetaAccessTokenService::class);
        $accessTokenService->shouldReceive('getTenantAccessToken')
            ->once()
            ->with($tenant->id)
            ->andReturn(null);

        $capiService = Mockery::mock(MetaCapiService::class);
        $capiService->shouldNotReceive('sendLeadEventIfEnabled');

        $service = new MetaLeadService($apiClient, $accessTokenService, $capiService);
        $service->processLead($tenant->id, 'lead-123');

        $this->assertTrue(true);
    }
}
