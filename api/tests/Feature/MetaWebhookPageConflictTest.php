<?php

namespace Tests\Feature;

use App\Jobs\ProcessMetaLead;
use App\Models\MetaConnection;
use App\Models\MetaPage;
use App\Models\Tenant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaWebhookPageConflictTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    public function test_webhook_rejects_lead_when_same_page_id_is_linked_to_multiple_tenants(): void
    {
        Queue::fake();
        $this->seedSharedMetaApp('123456', 'shared-secret', 'verify-token');

        $tenantA = Tenant::create(['id' => 'tenant_a', 'name' => 'Tenant A', 'slug' => 'tenant-a', 'status' => 'active']);
        $tenantB = Tenant::create(['id' => 'tenant_b', 'name' => 'Tenant B', 'slug' => 'tenant-b', 'status' => 'active']);

        $connectionA = MetaConnection::create([
            'tenant_id' => $tenantA->id,
            'fb_user_id' => 'fb-user-a',
            'user_access_token' => 'token-a',
        ]);

        MetaPage::create([
            'tenant_id' => $tenantA->id,
            'connection_id' => $connectionA->id,
            'page_id' => 'shared-page',
            'page_name' => 'Shared Page A',
            'page_token' => 'page-token-a',
            'is_active' => true,
        ]);

        $connectionB = MetaConnection::create([
            'tenant_id' => $tenantB->id,
            'fb_user_id' => 'fb-user-b',
            'user_access_token' => 'token-b',
        ]);

        MetaPage::create([
            'tenant_id' => $tenantB->id,
            'connection_id' => $connectionB->id,
            'page_id' => 'shared-page',
            'page_name' => 'Shared Page B',
            'page_token' => 'page-token-b',
            'is_active' => true,
        ]);

        $payload = [
            'object' => 'page',
            'entry' => [[
                'id' => 'shared-page',
                'changes' => [[
                    'field' => 'leadgen',
                    'value' => [
                        'leadgen_id' => 'lead-123',
                        'page_id' => 'shared-page',
                    ],
                ]],
            ]],
        ];

        $rawBody = json_encode($payload);
        $signature = 'sha256=' . hash_hmac('sha256', $rawBody, 'shared-secret');

        $response = $this->postJson('/api/meta/webhook', $payload, [
            'X-Hub-Signature-256' => $signature,
        ]);

        $response->assertOk()->assertJson(['ok' => true]);
        Queue::assertNotPushed(ProcessMetaLead::class);
    }
}
