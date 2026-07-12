<?php

namespace Tests\Feature;

use App\Models\Integration;
use App\Models\MetaConnection;
use App\Models\MetaDataDeletionRequest;
use App\Models\MetaPage;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaDataDeletionTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    public function test_data_deletion_callback_removes_meta_connections_and_returns_confirmation(): void
    {
        $this->seedSharedMetaApp('123456', 'shared-secret', 'verify-token');

        $tenant = Tenant::create([
            'id' => 'tenant_delete',
            'name' => 'Tenant Delete',
            'slug' => 'tenant-delete',
            'status' => 'active',
        ]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-delete',
            'user_access_token' => 'token-delete',
        ]);

        MetaPage::create([
            'tenant_id' => $tenant->id,
            'connection_id' => $connection->id,
            'page_id' => 'page-delete',
            'page_name' => 'Delete Page',
            'page_token' => 'page-token',
            'is_active' => true,
        ]);

        Integration::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'status' => 'active',
        ]);

        $payload = json_encode(['user_id' => 'fb-user-delete', 'algorithm' => 'HMAC-SHA256']);
        $encodedPayload = rtrim(strtr(base64_encode($payload), '+/', '-_'), '=');
        $encodedSig = rtrim(strtr(base64_encode(hash_hmac('sha256', $encodedPayload, 'shared-secret', true)), '+/', '-_'), '=');
        $signedRequest = $encodedSig . '.' . $encodedPayload;

        $response = $this->post('/api/facebook/data-deletion', [
            'signed_request' => $signedRequest,
        ]);

        $response->assertOk()
            ->assertJsonStructure(['url', 'confirmation_code']);

        $this->assertDatabaseMissing('meta_connections', [
            'fb_user_id' => 'fb-user-delete',
        ]);

        $this->assertDatabaseMissing('meta_pages', [
            'page_id' => 'page-delete',
        ]);

        $this->assertDatabaseHas('integrations', [
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'status' => 'inactive',
        ]);

        $this->assertDatabaseHas('meta_data_deletion_requests', [
            'fb_user_id' => 'fb-user-delete',
            'status' => 'completed',
            'connections_deleted' => 1,
            'pages_deleted' => 1,
        ]);

        $confirmationCode = $response->json('confirmation_code');
        $this->assertNotEmpty($confirmationCode);
        $this->assertDatabaseHas('meta_data_deletion_requests', [
            'confirmation_code' => $confirmationCode,
        ]);
    }
}
