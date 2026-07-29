<?php

namespace Tests\Feature;

use App\Models\Integration;
use App\Models\MetaConnection;
use App\Models\MetaPage;
use App\Models\Tenant;
use App\Models\User;
use App\Services\MetaHealthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaAttentionStatusTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    public function test_attention_is_false_when_no_meta_connection_exists(): void
    {
        $tenant = Tenant::create([
            'id' => 'tenant_no_meta',
            'name' => 'No Meta Tenant',
            'slug' => 'no-meta-tenant',
            'status' => 'active',
        ]);

        $attention = app(MetaHealthService::class)->getTenantAttention($tenant->id);

        $this->assertFalse($attention['needs_attention']);
        $this->assertSame([], $attention['reasons']);
    }

    public function test_attention_flags_reauth_required_connection(): void
    {
        $tenant = Tenant::create([
            'id' => 'tenant_reauth',
            'name' => 'Reauth Tenant',
            'slug' => 'reauth-tenant',
            'status' => 'active',
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-reauth',
            'user_access_token' => 'token',
            'needs_reauth' => true,
        ]);

        $attention = app(MetaHealthService::class)->getTenantAttention($tenant->id);

        $this->assertTrue($attention['needs_attention']);
        $this->assertContains('reauth_required', $attention['reasons']);
        $this->assertSame('Reconnection required', $attention['label']);
    }

    public function test_status_endpoint_includes_attention_payload(): void
    {
        $this->seedSharedMetaApp();

        $tenant = Tenant::create([
            'id' => 'tenant_status_attention',
            'name' => 'Status Attention Tenant',
            'slug' => 'status-attention-tenant',
            'status' => 'active',
        ]);

        $user = User::factory()->create(['tenant_id' => $tenant->id]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-status',
            'user_access_token' => 'token',
            'needs_reauth' => true,
        ]);

        MetaPage::create([
            'tenant_id' => $tenant->id,
            'connection_id' => $connection->id,
            'page_id' => 'page-status',
            'page_name' => 'Status Page',
            'page_token' => 'page-token',
            'is_active' => true,
        ]);

        Integration::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'status' => 'active',
            'settings' => [
                'subscribe_summary' => ['subscribed' => 1, 'failed' => 0],
            ],
        ]);

        $response = $this->actingAs($user)->getJson('/api/auth/meta/status');

        $response->assertOk()
            ->assertJsonPath('attention.needs_attention', true)
            ->assertJsonPath('attention.primary_reason', 'reauth_required')
            ->assertJsonPath('attention.label', 'Reconnection required');
    }

    public function test_status_endpoint_includes_go_live_checklist(): void
    {
        $this->seedSharedMetaApp();

        $tenant = Tenant::create([
            'id' => 'tenant_go_live',
            'name' => 'Go Live Tenant',
            'slug' => 'go-live-tenant',
            'status' => 'active',
        ]);

        $user = User::factory()->create(['tenant_id' => $tenant->id]);

        $response = $this->actingAs($user)->getJson('/api/auth/meta/status');

        $response->assertOk()
            ->assertJsonStructure([
                'go_live' => ['ready', 'completed', 'total', 'items'],
            ]);
    }
}
