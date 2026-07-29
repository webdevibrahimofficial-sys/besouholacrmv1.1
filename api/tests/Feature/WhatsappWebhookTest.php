<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\WhatsappSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WhatsappWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.whatsapp.webhook_verify_token', 'test-whatsapp-token');
    }

    public function test_webhook_verification_requires_configured_token()
    {
        $this->get('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1234')
            ->assertStatus(403);

        $this->get('/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-whatsapp-token&hub.challenge=1234')
            ->assertOk()
            ->assertSee('1234');
    }

    public function test_webhook_handles_incoming_message_and_maps_tenant()
    {
        $tenant = Tenant::factory()->create();
        WhatsappSetting::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'api_key' => 'token',
            'phone_number_id' => 'PHONE_123',
            'status' => true,
        ]);

        $payload = [
            'entry' => [
                [
                    'changes' => [
                        [
                            'value' => [
                                'metadata' => [
                                    'phone_number_id' => 'PHONE_123',
                                ],
                                'messages' => [
                                    [
                                        'id' => 'wamid.TEST123',
                                        'from' => '201001234567',
                                        'text' => ['body' => 'Hello, this is a test message...'],
                                    ]
                                ]
                            ]
                        ]
                    ]
                ]
            ]
        ];

        $resp = $this->postJson('/api/whatsapp/webhook', $payload);
        $resp->assertStatus(200)->assertJson(['status' => 'ok']);
        $this->assertDatabaseHas('whatsapp_messages', [
            'tenant_id' => $tenant->id,
            'phone_number_id' => 'PHONE_123',
            'from' => '201001234567',
            'message_id' => 'wamid.TEST123',
            'body' => 'Hello, this is a test message...',
        ]);
    }

    public function test_webhook_is_idempotent_for_duplicate_message_ids()
    {
        $tenant = Tenant::factory()->create();
        WhatsappSetting::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'api_key' => 'token',
            'phone_number_id' => 'PHONE_123',
            'status' => true,
        ]);

        $payload = [
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'metadata' => ['phone_number_id' => 'PHONE_123'],
                        'messages' => [[
                            'id' => 'wamid.DUPLICATE1',
                            'from' => '201001234567',
                            'text' => ['body' => 'Duplicate test'],
                        ]],
                    ],
                ]],
            ]],
        ];

        $this->postJson('/api/whatsapp/webhook', $payload)->assertOk();
        $this->postJson('/api/whatsapp/webhook', $payload)->assertOk();

        $this->assertDatabaseCount('whatsapp_messages', 1);
    }
}
