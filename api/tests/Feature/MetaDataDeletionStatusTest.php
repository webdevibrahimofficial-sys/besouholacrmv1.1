<?php

namespace Tests\Feature;

use App\Models\MetaDataDeletionRequest;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MetaDataDeletionStatusTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_status_endpoint_returns_deletion_request_details(): void
    {
        MetaDataDeletionRequest::create([
            'fb_user_id' => 'fb-user-status',
            'confirmation_code' => 'confirm-123',
            'status' => 'completed',
            'connections_deleted' => 2,
            'pages_deleted' => 3,
            'completed_at' => now(),
        ]);

        $response = $this->getJson('/api/facebook/data-deletion/status?code=confirm-123');

        $response->assertOk()
            ->assertJsonPath('status', 'completed')
            ->assertJsonPath('connections_deleted', 2)
            ->assertJsonPath('pages_deleted', 3)
            ->assertJsonStructure(['fb_user_id_masked', 'completed_at']);
    }

    public function test_tenant_status_includes_sync_warnings(): void
    {
        $tenant = Tenant::create([
            'id' => 'tenant_status',
            'name' => 'Tenant Status',
            'slug' => 'tenant-status',
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
        ]);

        \App\Models\Integration::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'status' => 'active',
            'settings' => [
                'sync_warnings' => [
                    ['type' => 'page_conflict', 'page_id' => '123', 'message' => 'Conflict'],
                ],
            ],
        ]);

        $response = $this->actingAs($user)->getJson('/api/auth/meta/status');

        $response->assertOk()
            ->assertJsonPath('sync_warnings.0.type', 'page_conflict');
    }
}
