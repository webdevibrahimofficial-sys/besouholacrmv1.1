<?php

namespace Tests\Feature;

use App\Models\MetaConnection;
use App\Models\MetaIntegration;
use App\Models\MetaPage;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class MetaTokenEncryptionTest extends TestCase
{
    use RefreshDatabase;

    public function test_meta_tokens_are_encrypted_on_write_and_decrypted_on_read(): void
    {
        $tenant = Tenant::create([
            'name' => 'Meta Tenant',
            'slug' => 'meta-tenant',
            'status' => 'active',
        ]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'plain-user-token',
            'name' => 'Meta User',
            'email' => 'meta@example.com',
        ]);

        $page = MetaPage::create([
            'tenant_id' => $tenant->id,
            'connection_id' => $connection->id,
            'page_id' => 'page-1',
            'page_name' => 'Page One',
            'page_token' => 'plain-page-token',
            'is_active' => true,
        ]);

        $integration = MetaIntegration::create([
            'tenant_id' => $tenant->id,
            'page_access_token' => 'plain-page-access-token',
            'user_access_token' => 'plain-short-lived-token',
            'long_lived_token' => 'plain-long-lived-token',
        ]);

        $rawConnectionToken = DB::table('meta_connections')->where('id', $connection->id)->value('user_access_token');
        $rawPageToken = DB::table('meta_pages')->where('id', $page->id)->value('page_token');
        $rawIntegrationPageToken = DB::table('meta_integrations')->where('id', $integration->id)->value('page_access_token');
        $rawIntegrationUserToken = DB::table('meta_integrations')->where('id', $integration->id)->value('user_access_token');
        $rawIntegrationLongLivedToken = DB::table('meta_integrations')->where('id', $integration->id)->value('long_lived_token');

        $this->assertNotSame('plain-user-token', $rawConnectionToken);
        $this->assertNotSame('plain-page-token', $rawPageToken);
        $this->assertNotSame('plain-page-access-token', $rawIntegrationPageToken);
        $this->assertNotSame('plain-short-lived-token', $rawIntegrationUserToken);
        $this->assertNotSame('plain-long-lived-token', $rawIntegrationLongLivedToken);

        $this->assertSame('plain-user-token', $connection->fresh()->user_access_token);
        $this->assertSame('plain-page-token', $page->fresh()->page_token);
        $freshIntegration = $integration->fresh();
        $this->assertSame('plain-page-access-token', $freshIntegration->page_access_token);
        $this->assertSame('plain-short-lived-token', $freshIntegration->user_access_token);
        $this->assertSame('plain-long-lived-token', $freshIntegration->long_lived_token);
    }

    public function test_existing_plaintext_meta_tokens_remain_readable_during_rollout(): void
    {
        $tenant = Tenant::create([
            'name' => 'Legacy Meta Tenant',
            'slug' => 'legacy-meta-tenant',
            'status' => 'active',
        ]);

        DB::table('meta_connections')->insert([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'legacy-fb-user',
            'user_access_token' => 'legacy-plain-token',
            'name' => 'Legacy User',
            'email' => 'legacy@example.com',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertSame('legacy-plain-token', MetaConnection::firstOrFail()->user_access_token);
    }
}
