<?php

namespace Tests\Feature;

use App\Jobs\ProcessMetaLead;
use App\Models\Agency;
use App\Models\MetaConnection;
use App\Models\MetaPage;
use App\Models\Tenant;
use App\Models\TenantMetaApp;
use App\Models\User;
use App\Services\MetaCredentialsResolver;
use App\Services\TenantMetaAppService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class TenantMetaByoaTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    protected function createTenantUser(string $tenantId = 'tenant_byoa'): array
    {
        $tenant = Tenant::create([
            'id' => $tenantId,
            'name' => 'Tenant BYOA',
            'slug' => str_replace('_', '-', $tenantId),
            'status' => 'active',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Tenant Admin',
        ]);

        $agency = Agency::create([
            'tenant_id' => $tenant->id,
            'name' => 'Default Agency',
            'key' => 'default-agency',
            'is_active' => true,
        ]);

        return compact('tenant', 'user', 'agency');
    }

    public function test_resolver_uses_custom_app_when_configured(): void
    {
        $this->seedSharedMetaApp('shared-id', 'shared-secret', 'shared-verify');
        ['tenant' => $tenant] = $this->createTenantUser();

        app(TenantMetaAppService::class)->upsertForTenant($tenant->id, [
            'mode' => TenantMetaApp::MODE_CUSTOM,
            'app_id' => 'custom-app-id',
            'app_secret' => 'custom-app-secret',
            'verify_token' => 'custom-verify',
        ]);

        $credentials = app(MetaCredentialsResolver::class)->resolveForTenant($tenant->id);

        $this->assertSame('custom', $credentials['source']);
        $this->assertSame('custom-app-id', $credentials['app_id']);
        $this->assertSame('custom-app-secret', $credentials['app_secret']);
        $this->assertSame('custom-verify', $credentials['verify_token']);
        $this->assertNotEmpty($credentials['webhook_key']);
    }

    public function test_resolver_falls_back_to_shared_when_mode_is_shared(): void
    {
        $this->seedSharedMetaApp('shared-id', 'shared-secret', 'shared-verify');
        ['tenant' => $tenant] = $this->createTenantUser('tenant_shared_mode');

        app(TenantMetaAppService::class)->upsertForTenant($tenant->id, [
            'mode' => TenantMetaApp::MODE_CUSTOM,
            'app_id' => 'custom-app-id',
            'app_secret' => 'custom-app-secret',
            'verify_token' => 'custom-verify',
        ]);

        app(TenantMetaAppService::class)->upsertForTenant($tenant->id, [
            'mode' => TenantMetaApp::MODE_SHARED,
        ]);

        $credentials = app(MetaCredentialsResolver::class)->resolveForTenant($tenant->id);

        $this->assertSame('shared', $credentials['source']);
        $this->assertSame('shared-id', $credentials['app_id']);
        $this->assertSame('shared-secret', $credentials['app_secret']);
    }

    public function test_tenant_can_connect_with_custom_app_without_shared_app(): void
    {
        ['tenant' => $tenant, 'user' => $user, 'agency' => $agency] = $this->createTenantUser('tenant_custom_only');

        config(['services.meta.mock_mode' => true]);

        $save = $this->actingAs($user)->putJson('/api/auth/meta/app', [
            'mode' => 'custom',
            'app_id' => '999888777',
            'app_secret' => 'tenant-secret-value',
            'verify_token' => 'tenant-verify-token',
        ]);

        $save->assertOk()
            ->assertJsonPath('connection_mode', 'custom')
            ->assertJsonPath('meta_ready', true)
            ->assertJsonPath('tenant_app.app_id', '999888777');

        $this->assertArrayNotHasKey('app_secret', $save->json('tenant_app') ?? []);

        $redirect = $this->actingAs($user)->getJson('/api/auth/meta/redirect?agency_id=' . $agency->key);
        $redirect->assertOk()->assertJsonStructure(['url']);
    }

    public function test_custom_webhook_verify_and_receive(): void
    {
        Queue::fake();
        ['tenant' => $tenant, 'user' => $user] = $this->createTenantUser('tenant_webhook');

        $save = $this->actingAs($user)->putJson('/api/auth/meta/app', [
            'mode' => 'custom',
            'app_id' => '111222333',
            'app_secret' => 'webhook-secret',
            'verify_token' => 'webhook-verify',
        ]);
        $save->assertOk();

        $webhookKey = $save->json('tenant_app.webhook_key');
        $this->assertNotEmpty($webhookKey);

        $verify = $this->get('/api/meta/webhook/' . $webhookKey . '?hub.mode=subscribe&hub.verify_token=webhook-verify&hub.challenge=byoa-challenge');
        $verify->assertOk();
        $verify->assertSee('byoa-challenge');

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-byoa',
            'user_access_token' => 'token-byoa',
        ]);

        MetaPage::create([
            'tenant_id' => $tenant->id,
            'connection_id' => $connection->id,
            'page_id' => 'page-byoa',
            'page_name' => 'BYOA Page',
            'page_token' => 'page-token',
            'is_active' => true,
        ]);

        $payload = [
            'object' => 'page',
            'entry' => [[
                'id' => 'page-byoa',
                'changes' => [[
                    'field' => 'leadgen',
                    'value' => [
                        'leadgen_id' => 'lead-byoa-1',
                        'page_id' => 'page-byoa',
                    ],
                ]],
            ]],
        ];

        $rawBody = json_encode($payload);
        $signature = 'sha256=' . hash_hmac('sha256', $rawBody, 'webhook-secret');

        $receive = $this->call(
            'POST',
            '/api/meta/webhook/' . $webhookKey,
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_X-Hub-Signature-256' => $signature,
            ],
            $rawBody
        );

        $receive->assertOk()->assertJson(['ok' => true]);
        Queue::assertPushed(ProcessMetaLead::class);
    }

    public function test_custom_webhook_rejects_invalid_signature(): void
    {
        ['user' => $user] = $this->createTenantUser('tenant_bad_sig');

        $save = $this->actingAs($user)->putJson('/api/auth/meta/app', [
            'mode' => 'custom',
            'app_id' => '444555666',
            'app_secret' => 'real-secret',
            'verify_token' => 'verify-x',
        ]);
        $webhookKey = $save->json('tenant_app.webhook_key');

        $payload = ['object' => 'page', 'entry' => []];
        $rawBody = json_encode($payload);
        $signature = 'sha256=' . hash_hmac('sha256', $rawBody, 'wrong-secret');

        $receive = $this->call(
            'POST',
            '/api/meta/webhook/' . $webhookKey,
            [],
            [],
            [],
            [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_X-Hub-Signature-256' => $signature,
            ],
            $rawBody
        );

        $receive->assertStatus(403);
    }

    public function test_mode_switch_marks_connections_needing_reauth(): void
    {
        $this->seedSharedMetaApp();
        ['tenant' => $tenant, 'user' => $user] = $this->createTenantUser('tenant_reauth');

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-1',
            'user_access_token' => 'token-1',
            'needs_reauth' => false,
        ]);

        $this->actingAs($user)->putJson('/api/auth/meta/app', [
            'mode' => 'custom',
            'app_id' => 'reauth-app',
            'app_secret' => 'reauth-secret',
            'verify_token' => 'reauth-verify',
        ])->assertOk();

        $this->assertDatabaseHas('meta_connections', [
            'tenant_id' => $tenant->id,
            'needs_reauth' => true,
        ]);
    }

    public function test_whatsapp_status_still_uses_shared_credentials_when_tenant_has_custom_app(): void
    {
        $this->seedSharedMetaApp('shared-wa-id', 'shared-wa-secret', 'shared-wa-verify');
        ['tenant' => $tenant, 'user' => $user] = $this->createTenantUser('tenant_wa_shared');

        $this->actingAs($user)->putJson('/api/auth/meta/app', [
            'mode' => 'custom',
            'app_id' => 'custom-wa-should-not-win',
            'app_secret' => 'custom-wa-secret',
            'verify_token' => 'custom-wa-verify',
        ])->assertOk();

        $status = $this->actingAs($user)->getJson('/api/auth/whatsapp/status');
        $status->assertOk()
            ->assertJsonPath('shared_meta_configured', true)
            ->assertJsonPath('meta_app_id', 'shared-wa-id');

        $shared = app(MetaCredentialsResolver::class)->resolveShared();
        $tenantCustom = app(MetaCredentialsResolver::class)->resolveForTenant($tenant->id);

        $this->assertSame('shared-wa-id', $shared['app_id']);
        $this->assertSame('custom', $tenantCustom['source']);
        $this->assertSame('custom-wa-should-not-win', $tenantCustom['app_id']);
        $this->assertNotSame($shared['app_id'], $tenantCustom['app_id']);
    }
}
