<?php

namespace Tests\Feature;

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
}
