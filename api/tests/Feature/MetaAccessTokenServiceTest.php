<?php

namespace Tests\Feature;

use App\Contracts\MetaApiClientInterface;
use App\Models\MetaAdAccount;
use App\Models\MetaBusiness;
use App\Models\MetaConnection;
use App\Models\Tenant;
use App\Models\User;
use App\Notifications\MetaTokenRefreshAttentionNotification;
use App\Services\MetaAccessTokenService;
use App\Services\MetaCampaignService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Mockery;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaAccessTokenServiceTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    public function test_get_tenant_access_token_refreshes_expired_connection(): void
    {
        $this->seedSharedMetaApp();

        $tenant = Tenant::create([
            'name' => 'Token Refresh Tenant',
            'slug' => 'token-refresh-tenant',
            'status' => 'active',
        ]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'expired-token',
            'expires_at' => now()->subDay(),
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('get')
            ->once()
            ->with('/oauth/access_token', Mockery::type('array'))
            ->andReturn([
                'access_token' => 'refreshed-token',
                'expires_in' => 5184000,
            ]);

        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        $service = app(MetaAccessTokenService::class);
        $token = $service->getTenantAccessToken($tenant->id);

        $this->assertSame('refreshed-token', $token);
        // user_access_token uses EncryptCast, so compare through the model instead of raw DB values.
        $this->assertSame('refreshed-token', $connection->fresh()->user_access_token);
    }

    public function test_failed_refresh_alerts_tenant_admin_regardless_of_admin_feature_flag(): void
    {
        // The super-admin notification system is intentionally left OFF here to
        // prove the tenant still gets alerted through the direct notification path.
        config(['features.admin_notifications_v1' => false]);
        Notification::fake();
        $this->seedSharedMetaApp();

        $tenant = Tenant::create([
            'name' => 'Failing Refresh Tenant',
            'slug' => 'failing-refresh-tenant',
            'status' => 'active',
        ]);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-fail',
            'user_access_token' => 'expired-token',
            'expires_at' => now()->subDay(),
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('get')
            ->with('/oauth/access_token', Mockery::type('array'))
            ->andReturn([]); // Empty response => refresh fails.

        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        $service = app(MetaAccessTokenService::class);
        $token = $service->getTenantAccessToken($tenant->id);

        $this->assertNull($token);

        Notification::assertSentTo(
            $admin,
            MetaTokenRefreshAttentionNotification::class,
            function (MetaTokenRefreshAttentionNotification $notification, array $channels) use ($connection, $admin) {
                $payload = $notification->toArray($admin);

                return in_array('mail', $channels, true)
                    && in_array('database', $channels, true)
                    && ($payload['connection_id'] ?? null) === $connection->id;
            }
        );
    }

    public function test_repeated_refresh_failures_are_deduped_within_a_day(): void
    {
        Notification::fake();
        $this->seedSharedMetaApp();

        $tenant = Tenant::create([
            'name' => 'Dedupe Tenant',
            'slug' => 'dedupe-tenant',
            'status' => 'active',
        ]);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-dedupe',
            'user_access_token' => 'expired-token',
            'expires_at' => now()->subDay(),
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('get')
            ->with('/oauth/access_token', Mockery::type('array'))
            ->andReturn([]);

        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        $service = app(MetaAccessTokenService::class);

        // Simulate hourly sync hitting the same expired connection multiple times.
        $service->getTenantAccessToken($tenant->id);
        $service->getTenantAccessToken($tenant->id);
        $service->getTenantAccessToken($tenant->id);

        Notification::assertSentToTimes($admin, MetaTokenRefreshAttentionNotification::class, 1);
    }

    public function test_campaign_sync_uses_refreshed_token_when_connection_expired(): void
    {
        $this->seedSharedMetaApp();

        config([
            'services.meta.mock_mode' => true,
            'services.meta.mock_failure_probability' => 0,
        ]);

        $tenant = Tenant::create([
            'id' => 'expired_sync_tenant',
            'name' => 'Expired Sync Tenant',
            'slug' => 'expired-sync-tenant',
            'status' => 'active',
        ]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'expired-token',
            'expires_at' => now()->subDay(),
        ]);

        $business = MetaBusiness::create([
            'tenant_id' => $tenant->id,
            'connection_id' => $connection->id,
            'fb_business_id' => 'mock_business_1',
            'business_name' => 'Mock Business',
        ]);

        MetaAdAccount::create([
            'tenant_id' => $tenant->id,
            'business_id' => $business->id,
            'ad_account_id' => 'mock_ad_account_1',
            'name' => 'Mock Ad Account',
            'is_active' => true,
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('get')
            ->with('/oauth/access_token', Mockery::type('array'))
            ->once()
            ->andReturn([
                'access_token' => 'refreshed-token',
                'expires_in' => 5184000,
            ]);

        $apiClient->shouldReceive('get')
            ->with(Mockery::type('string'), Mockery::on(function (array $params) {
                return ($params['access_token'] ?? null) === 'refreshed-token';
            }))
            ->atLeast()
            ->once()
            ->andReturn(['data' => []]);

        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        app(MetaCampaignService::class)->syncAll($tenant->id);

        // user_access_token uses EncryptCast, so compare through the model instead of raw DB values.
        $this->assertSame('refreshed-token', $connection->fresh()->user_access_token);
    }
}
