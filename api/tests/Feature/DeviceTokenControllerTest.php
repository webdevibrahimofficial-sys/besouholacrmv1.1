<?php

namespace Tests\Feature;

use App\Models\DeviceToken;
use App\Models\Tenant;
use App\Models\User;
use App\Services\FcmService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class DeviceTokenControllerTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'name' => 'Device Token Tenant',
            'slug' => 'device-token-tenant',
            'status' => 'active',
        ]);

        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
        ]);
    }

    public function test_unauthenticated_user_cannot_register_token(): void
    {
        $response = $this
            ->withHeader('X-Tenant-Id', $this->tenant->slug)
            ->postJson('/api/device-tokens', [
                'token' => 'FCM_TOKEN_1',
            ]);

        $response->assertUnauthorized();
    }

    public function test_authenticated_user_can_register_token(): void
    {
        Sanctum::actingAs($this->user);

        $response = $this
            ->withHeader('X-Tenant-Id', $this->tenant->slug)
            ->postJson('/api/device-tokens', [
                'token' => 'FCM_TOKEN_2',
                'platform' => 'android',
                'device_name' => 'Samsung A52',
            ]);

        $response->assertOk();

        $this->assertDatabaseHas('device_tokens', [
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'token' => 'FCM_TOKEN_2',
            'platform' => 'android',
            'device_name' => 'Samsung A52',
        ]);
    }

    public function test_duplicate_token_updates_existing_record(): void
    {
        Sanctum::actingAs($this->user);

        DeviceToken::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'token' => 'FCM_DUPLICATE',
            'platform' => 'android',
            'device_name' => 'Old Device',
        ]);

        $response = $this
            ->withHeader('X-Tenant-Id', $this->tenant->slug)
            ->postJson('/api/device-tokens', [
                'token' => 'FCM_DUPLICATE',
                'platform' => 'ios',
                'device_name' => 'iPhone 15',
            ]);

        $response->assertOk();

        $this->assertEquals(
            1,
            DeviceToken::withoutGlobalScopes()->where('token', 'FCM_DUPLICATE')->count()
        );

        $this->assertDatabaseHas('device_tokens', [
            'token' => 'FCM_DUPLICATE',
            'platform' => 'ios',
            'device_name' => 'iPhone 15',
        ]);
    }

    public function test_user_can_delete_own_token(): void
    {
        Sanctum::actingAs($this->user);

        DeviceToken::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'token' => 'FCM_OWN_TOKEN',
        ]);

        $response = $this
            ->withHeader('X-Tenant-Id', $this->tenant->slug)
            ->deleteJson('/api/device-tokens', [
                'token' => 'FCM_OWN_TOKEN',
            ]);

        $response->assertOk();

        $this->assertDatabaseMissing('device_tokens', [
            'token' => 'FCM_OWN_TOKEN',
        ]);
    }

    public function test_user_cannot_delete_another_users_token(): void
    {
        $otherUser = User::factory()->create([
            'tenant_id' => $this->tenant->id,
        ]);

        DeviceToken::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'user_id' => $otherUser->id,
            'token' => 'FCM_OTHER_TOKEN',
        ]);

        Sanctum::actingAs($this->user);

        $response = $this
            ->withHeader('X-Tenant-Id', $this->tenant->slug)
            ->deleteJson('/api/device-tokens', [
                'token' => 'FCM_OTHER_TOKEN',
            ]);

        $response->assertOk();

        $this->assertDatabaseHas('device_tokens', [
            'token' => 'FCM_OTHER_TOKEN',
            'user_id' => $otherUser->id,
        ]);
    }

    public function test_authenticated_user_can_send_test_notification(): void
    {
        Sanctum::actingAs($this->user);

        $expectedResult = [
            'ok' => true,
            'total_tokens' => 1,
            'successes' => 1,
            'failures' => 0,
            'invalid_tokens_removed' => 0,
            'invalid_tokens' => [],
        ];

        $mock = Mockery::mock(FcmService::class);
        $mock->shouldReceive('sendToUser')
            ->once()
            ->with($this->user, 'Test Title', 'Test Body', ['screen' => 'dashboard'])
            ->andReturn($expectedResult);

        $this->app->instance(FcmService::class, $mock);

        $response = $this
            ->withHeader('X-Tenant-Id', $this->tenant->slug)
            ->postJson('/api/device-tokens/test-notification', [
                'title' => 'Test Title',
                'body' => 'Test Body',
                'data' => [
                    'screen' => 'dashboard',
                ],
            ]);

        $response
            ->assertOk()
            ->assertJson([
                'message' => 'Test notification processed',
                'result' => $expectedResult,
            ]);
    }
}
