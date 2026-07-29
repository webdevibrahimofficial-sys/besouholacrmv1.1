<?php

namespace Tests\Feature;

use App\Models\Agency;
use App\Models\MetaConnection;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaSingleConnectionGuardTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    public function test_redirect_is_blocked_when_same_agency_already_has_meta_connection(): void
    {
        $this->seedSharedMetaApp();

        $tenant = Tenant::create([
            'id' => 'tenant_meta_single_redirect',
            'name' => 'Tenant Meta Single Redirect',
            'slug' => 'tenant-meta-single-redirect',
            'status' => 'active',
        ]);

        $agency = Agency::create([
            'tenant_id' => $tenant->id,
            'name' => 'Agency A',
            'key' => 'agency-a',
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Tenant Admin',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->key,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'token-1',
        ]);

        $response = $this->actingAs($user)->getJson('/api/auth/meta/redirect?agency_id=' . $agency->key);

        $response->assertStatus(409)->assertJson([
            'error' => 'This agency already has a connected Meta account. Disconnect it first before connecting another.',
        ]);
    }

    public function test_callback_is_blocked_when_same_agency_already_has_meta_connection(): void
    {
        $this->seedSharedMetaApp();
        config(['services.meta.mock_mode' => true]);

        $tenant = Tenant::create([
            'id' => 'tenant_meta_single_callback',
            'name' => 'Tenant Meta Single Callback',
            'slug' => 'tenant-meta-single-callback',
            'status' => 'active',
        ]);

        $agency = Agency::create([
            'tenant_id' => $tenant->id,
            'name' => 'Agency A',
            'key' => 'agency-a',
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Tenant Admin',
        ]);

        $state = \Illuminate\Support\Str::random(64);
        \Illuminate\Support\Facades\Cache::put('meta_oauth_state:' . $state, [
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'agency_id' => $agency->key,
        ], now()->addMinutes(10));

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'agency_id' => $agency->key,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'token-1',
        ]);

        $response = $this->actingAs($user)->postJson('/api/auth/meta/callback', [
            'code' => 'mock_code_existing_connection',
            'state' => $state,
        ]);

        $response->assertStatus(409)->assertJson([
            'error' => 'This agency already has a connected Meta account. Disconnect it first before connecting another.',
        ]);
    }
}
