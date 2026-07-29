<?php

namespace Tests\Feature;

use App\Models\MetaConnection;
use App\Models\Tenant;
use App\Models\User;
use App\Notifications\MetaTokenRefreshAttentionNotification;
use App\Services\MetaAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Mockery;
use Tests\TestCase;

class RefreshMetaTokensCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_command_refreshes_expiring_meta_tokens(): void
    {
        $tenant = Tenant::factory()->create();

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'token-1',
            'expires_at' => now()->addDays(3),
            'name' => 'Meta User',
            'email' => 'meta@example.com',
        ]);

        $service = Mockery::mock(MetaAuthService::class);
        $service->shouldReceive('refreshToken')
            ->once()
            ->with(Mockery::on(fn (MetaConnection $model) => $model->id === $connection->id))
            ->andReturnUsing(function (MetaConnection $model) {
                $model->forceFill(['expires_at' => now()->addDays(60)])->save();

                return true;
            });

        $this->app->instance(MetaAuthService::class, $service);

        $this->artisan('meta:refresh-tokens --days=7')
            ->expectsOutputToContain('Found 1 tokens expiring soon.')
            ->assertExitCode(0);
    }

    public function test_command_notifies_tenant_admin_when_refresh_fails(): void
    {
        Notification::fake();

        $tenant = Tenant::factory()->create();
        $admin = User::factory()->create(['tenant_id' => $tenant->id]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-2',
            'user_access_token' => 'token-2',
            'expires_at' => now()->addDays(2),
            'name' => 'Meta User 2',
            'email' => 'meta2@example.com',
        ]);

        $service = Mockery::mock(MetaAuthService::class);
        $service->shouldReceive('refreshToken')
            ->once()
            ->with(Mockery::on(fn (MetaConnection $model) => $model->id === $connection->id))
            ->andReturn(false);

        $this->app->instance(MetaAuthService::class, $service);

        $this->artisan('meta:refresh-tokens --days=7')
            ->expectsOutputToContain('Failed to refresh token.')
            ->assertExitCode(0);

        Notification::assertSentTo(
            $admin,
            MetaTokenRefreshAttentionNotification::class,
            function (MetaTokenRefreshAttentionNotification $notification, array $channels) use ($connection, $admin) {
                $payload = $notification->toArray($admin);

                return in_array('database', $channels, true)
                    && ($payload['connection_id'] ?? null) === $connection->id;
            }
        );
    }
}
