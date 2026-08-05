<?php

namespace Tests\Feature;

use App\Models\DeviceToken;
use App\Models\Tenant;
use App\Models\User;
use App\Services\FcmService;
use App\Services\HuaweiPushService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Kreait\Firebase\Contract\Messaging;
use Mockery;
use Tests\TestCase;

class FcmServiceRoutingTest extends TestCase
{
    use RefreshDatabase;

    public function test_service_routes_fcm_and_hms_tokens_to_the_correct_provider(): void
    {
        $tenant = Tenant::create([
            'name' => 'Push Routing Tenant',
            'slug' => 'push-routing-tenant',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
        ]);

        DeviceToken::withoutGlobalScopes()->create([
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'token' => 'FCM_ANDROID_TOKEN',
            'platform' => 'android',
            'push_provider' => 'fcm',
        ]);

        DeviceToken::withoutGlobalScopes()->create([
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'token' => 'FCM_IOS_TOKEN',
            'platform' => 'ios',
            'push_provider' => 'hms',
        ]);

        DeviceToken::withoutGlobalScopes()->create([
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'token' => 'HMS_ANDROID_TOKEN',
            'platform' => 'android',
            'push_provider' => 'hms',
        ]);

        $messaging = Mockery::mock(Messaging::class);
        $multicastReport = new class {
            public function invalidTokens(): array { return []; }
            public function unknownTokens(): array { return []; }
            public function successes(): object { return new class { public function count(): int { return 2; } }; }
            public function failures(): object { return new class { public function count(): int { return 0; } public function getItems(): array { return []; } }; }
        };

        $messaging->shouldReceive('sendMulticast')
            ->once()
            ->withArgs(function ($message, array $tokens) {
                sort($tokens);
                return $tokens === ['FCM_ANDROID_TOKEN', 'FCM_IOS_TOKEN'];
            })
            ->andReturn($multicastReport);

        $huaweiPushService = Mockery::mock(HuaweiPushService::class);
        $huaweiPushService->shouldReceive('sendToTokens')
            ->once()
            ->with(['HMS_ANDROID_TOKEN'], 'Route Title', 'Route Body', ['screen' => 'dashboard'])
            ->andReturn([
                'ok' => true,
                'total_tokens' => 1,
                'successes' => 1,
                'failures' => 0,
                'invalid_tokens_removed' => 0,
                'invalid_tokens' => [],
            ]);

        $service = new FcmService($messaging, $huaweiPushService);

        $result = $service->sendToUser($user, 'Route Title', 'Route Body', ['screen' => 'dashboard']);

        $this->assertTrue($result['ok']);
        $this->assertSame(3, $result['total_tokens']);
        $this->assertSame(3, $result['successes']);
        $this->assertSame(0, $result['failures']);
    }
}
