<?php

namespace Tests\Feature;

use App\Events\InboundWhatsappMessage;
use App\Jobs\ProcessHistorySyncBatch;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WhatsappContact;
use App\Models\WhatsappMessage;
use App\Models\WhatsappMirrorSession;
use App\Services\Whatsapp\WhatsappGroupContactService;
use App\Services\Whatsapp\WhatsappMirrorProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsappMirrorTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.wa_mirror.url', 'http://wa-mirror.test');
        config()->set('services.wa_mirror.token', 'test-internal-token');
    }

    public function test_send_text_reuses_existing_echo_message_by_message_id(): void
    {
        Event::fake([InboundWhatsappMessage::class]);

        $tenant = Tenant::factory()->create();
        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'phone' => '01001234567',
        ]);

        $existingMessage = WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'source' => 'live',
            'direction' => 'outbound',
            'from' => '201099999999',
            'to' => '201001234567',
            'type' => 'text',
            'status' => 'sent',
            'message_id' => 'wamid.mirror.1',
            'body' => 'hello from crm',
            'lead_id' => $lead->id,
        ]);

        Http::fake([
            'http://wa-mirror.test/sessions/*/send' => Http::response([
                'messageId' => 'wamid.mirror.1',
            ], 200),
        ]);

        $provider = app(WhatsappMirrorProvider::class);
        $result = $provider->sendText($tenant->id, '201001234567', 'hello from crm');

        $this->assertTrue($result['success']);
        $this->assertSame('wamid.mirror.1', $result['message_id']);
        $this->assertSame($existingMessage->id, $result['db_id']);
        $this->assertDatabaseCount('whatsapp_messages', 1);
        $this->assertDatabaseHas('whatsapp_messages', [
            'id' => $existingMessage->id,
            'source' => 'live',
        ]);
    }

    public function test_history_sync_does_not_dispatch_inbound_event(): void
    {
        Event::fake([InboundWhatsappMessage::class]);

        $tenant = Tenant::factory()->create();
        Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'phone' => '01001234567',
        ]);

        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
        ]);

        $job = new ProcessHistorySyncBatch($tenant->id, [[
            'message_id' => 'history-1',
            'phone' => '201001234567',
            'body' => 'old message',
            'from_me' => false,
        ]], true);

        $job->handle();

        Event::assertNotDispatched(InboundWhatsappMessage::class);
        $this->assertDatabaseHas('whatsapp_messages', [
            'tenant_id' => $tenant->id,
            'message_id' => 'history-1',
            'source' => 'history_sync',
        ]);
    }

    public function test_history_sync_marks_session_synced_after_first_non_latest_batch(): void
    {
        $tenant = Tenant::factory()->create();

        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
            'history_synced_at' => null,
        ]);

        $this->postJson('/api/internal/whatsapp-mirror/history-sync', [
            'tenant_id' => $tenant->id,
            'is_latest' => false,
            'messages' => [[
                'message_id' => 'history-2',
                'phone' => '201001234567',
                'body' => 'first batch',
                'from_me' => false,
            ]],
        ], [
            'X-Internal-Token' => 'test-internal-token',
        ])->assertOk();

        $this->assertNotNull(
            WhatsappMirrorSession::where('tenant_id', $tenant->id)->value('history_synced_at')
        );
    }

    public function test_group_contact_sync_can_resolve_lid_from_persisted_message_history(): void
    {
        $tenant = Tenant::factory()->create();

        WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'source' => 'history_sync',
            'direction' => 'inbound',
            'from' => '201001234567',
            'to' => '201099999999',
            'type' => 'text',
            'status' => 'received',
            'message_id' => 'legacy-lid-history-1',
            'counterpart_lid' => null,
            'body' => 'legacy message',
            'raw' => [
                'remote_jid' => '195893592608918@lid',
                'sender_pn' => '201001234567',
                'phone' => '195893592608918',
            ],
        ]);

        $summary = app(WhatsappGroupContactService::class)->syncContacts($tenant->id, [[
            'group_jid' => '120363000000000000@g.us',
            'group_name' => 'Legacy Group',
            'participant_jid' => '195893592608918@lid',
            'lid' => '195893592608918',
            'phone' => '195893592608918',
            'is_unresolved_lid' => true,
        ]]);

        $this->assertSame([], $summary['unresolved_lids']);
        $this->assertDatabaseHas('whatsapp_group_contacts', [
            'tenant_id' => $tenant->id,
            'group_jid' => '120363000000000000@g.us',
            'lid' => '195893592608918',
            'resolved_phone' => '201001234567',
            'is_unresolved_lid' => false,
        ]);
    }

    public function test_history_sync_upserts_contacts_into_persistent_contact_store(): void
    {
        $tenant = Tenant::factory()->create();

        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
        ]);

        $job = new ProcessHistorySyncBatch($tenant->id, [[
            'message_id' => 'history-contact-1',
            'phone' => '201001234567',
            'body' => 'old message',
            'from_me' => false,
            'remote_jid' => '195893592608918@lid',
            'sender_pn' => '201001234567',
            'push_name' => 'History Contact',
        ]], true);

        $job->handle();

        $this->assertDatabaseHas('whatsapp_contacts', [
            'tenant_id' => $tenant->id,
            'lid' => '195893592608918',
            'phone' => '201001234567',
            'push_name' => 'History Contact',
        ]);
    }

    public function test_group_contact_sync_does_not_store_lid_digits_as_resolved_phone_in_contact_cache(): void
    {
        $tenant = Tenant::factory()->create();

        app(WhatsappGroupContactService::class)->syncContacts($tenant->id, [[
            'group_jid' => '120363000000000001@g.us',
            'group_name' => 'Poison Guard Group',
            'participant_jid' => '113563565879363@lid',
            'lid' => '113563565879363',
            'phone' => '113563565879363',
            'is_unresolved_lid' => true,
        ]]);

        $contact = WhatsappContact::query()
            ->where('tenant_id', $tenant->id)
            ->where('lid', '113563565879363')
            ->first();

        $this->assertNotNull($contact);
        $this->assertNull($contact->phone);
    }

    public function test_empty_mirror_echo_does_not_overwrite_crm_send_body(): void
    {
        $tenant = Tenant::factory()->create();
        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
        ]);

        WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'source' => 'crm_send',
            'direction' => 'outbound',
            'to' => '201001234567',
            'type' => 'text',
            'status' => 'sent_to_session',
            'message_id' => 'wamid.mirror.echo-empty',
            'body' => 'hello from crm',
        ]);

        (new \App\Jobs\ProcessIncomingMirrorMessage([
            'tenant_id' => $tenant->id,
            'message' => [
                'message_id' => 'wamid.mirror.echo-empty',
                'from_me' => true,
                'from' => '201001234567',
                'counterpart_phone' => '201001234567',
                'body' => '',
                'type' => 'text',
            ],
        ]))->handle();

        $this->assertDatabaseHas('whatsapp_messages', [
            'tenant_id' => $tenant->id,
            'message_id' => 'wamid.mirror.echo-empty',
            'body' => 'hello from crm',
        ]);
    }

    public function test_send_text_backfills_empty_body_on_existing_echo(): void
    {
        Event::fake([InboundWhatsappMessage::class]);

        $tenant = Tenant::factory()->create();
        Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'phone' => '01001234567',
        ]);

        $existingMessage = WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'source' => 'live',
            'direction' => 'outbound',
            'to' => '201001234567',
            'type' => 'text',
            'status' => 'sent',
            'message_id' => 'wamid.mirror.empty-body',
            'body' => '',
        ]);

        Http::fake([
            'http://wa-mirror.test/sessions/*/send' => Http::response([
                'messageId' => 'wamid.mirror.empty-body',
            ], 200),
        ]);

        $provider = app(WhatsappMirrorProvider::class);
        $result = $provider->sendText($tenant->id, '201001234567', 'filled from crm');

        $this->assertTrue($result['success']);
        $this->assertSame($existingMessage->id, $result['db_id']);
        $this->assertDatabaseHas('whatsapp_messages', [
            'id' => $existingMessage->id,
            'body' => 'filled from crm',
        ]);
    }

    public function test_incoming_image_is_persisted_and_returned_as_browser_media_url(): void
    {
        Storage::fake('tenants');

        $tenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);

        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
        ]);

        $png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

        (new \App\Jobs\ProcessIncomingMirrorMessage([
            'tenant_id' => $tenant->id,
            'message' => [
                'message_id' => 'wamid.mirror.image-in',
                'from_me' => false,
                'from' => '201001234567',
                'counterpart_phone' => '201001234567',
                'body' => '',
                'type' => 'image',
                'media' => [
                    'type' => 'image',
                    'mime_type' => 'image/png',
                    'file_name' => 'photo.png',
                    'base64' => $png,
                ],
            ],
        ]))->handle();

        $stored = WhatsappMessage::query()
            ->where('tenant_id', $tenant->id)
            ->where('message_id', 'wamid.mirror.image-in')
            ->first();

        $this->assertNotNull($stored);
        $this->assertSame('image', $stored->type);
        $this->assertNotEmpty(data_get($stored->raw, 'request.attachment_path'));
        $this->assertNull(data_get($stored->raw, 'message.media.base64'));
        Storage::disk('tenants')->assertExists(data_get($stored->raw, 'request.attachment_path'));

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/whatsapp-mirror/conversation-messages?phone=201001234567');
        $response->assertOk();
        $item = collect($response->json('data'))->firstWhere('message_id', 'wamid.mirror.image-in');
        $this->assertNotNull($item);
        $this->assertSame('image', $item['media']['type'] ?? null);
        $this->assertNotEmpty($item['media']['url'] ?? null);
        $this->assertStringStartsWith('/', $item['media']['url']);
        $this->assertStringContainsString('/api/whatsapp/media/', $item['media']['url']);
    }

    public function test_send_media_does_not_lose_attachment_when_echo_arrives_first(): void
    {
        Event::fake([InboundWhatsappMessage::class]);
        Storage::fake('tenants');

        $tenant = Tenant::factory()->create();
        Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'phone' => '01001234567',
        ]);

        WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'source' => 'live',
            'direction' => 'outbound',
            'to' => '201001234567',
            'type' => 'image',
            'status' => 'sent',
            'message_id' => 'wamid.mirror.image-echo',
            'body' => '',
            'raw' => [
                'message' => [
                    'type' => 'image',
                    'media' => ['type' => 'image', 'base64' => null],
                ],
            ],
        ]);

        Http::fake([
            'http://wa-mirror.test/sessions/*/send-media' => Http::response([
                'messageId' => 'wamid.mirror.image-echo',
            ], 200),
        ]);

        $provider = app(WhatsappMirrorProvider::class);
        $result = $provider->sendMedia(
            $tenant->id,
            '201001234567',
            'image',
            'http://web/api/files/1/whatsapp/attachments/photo.jpg?signature=abc',
            'caption',
            'photo.jpg'
        );

        $this->assertTrue($result['success']);
        $stored = WhatsappMessage::query()->find($result['db_id']);
        $this->assertSame('image', $stored->type);
        $this->assertSame('caption', $stored->body);
        $this->assertSame(
            'http://web/api/files/1/whatsapp/attachments/photo.jpg?signature=abc',
            data_get($stored->raw, 'mirror.media_url')
        );
    }

    public function test_incoming_echo_does_not_drop_crm_attachment_path(): void
    {
        $tenant = Tenant::factory()->create();
        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
        ]);

        WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'source' => 'crm_send',
            'direction' => 'outbound',
            'to' => '201001234567',
            'type' => 'image',
            'status' => 'sent_to_session',
            'message_id' => 'wamid.mirror.keep-media',
            'body' => '',
            'raw' => [
                'request' => [
                    'attachment_path' => $tenant->id . '/whatsapp/attachments/kept.jpg',
                    'mime_type' => 'image/jpeg',
                    'original_name' => 'kept.jpg',
                ],
            ],
        ]);

        (new \App\Jobs\ProcessIncomingMirrorMessage([
            'tenant_id' => $tenant->id,
            'message' => [
                'message_id' => 'wamid.mirror.keep-media',
                'from_me' => true,
                'from' => '201001234567',
                'counterpart_phone' => '201001234567',
                'body' => '',
                'type' => 'image',
                'media' => [
                    'type' => 'image',
                    'base64' => null,
                ],
            ],
        ]))->handle();

        $stored = WhatsappMessage::query()
            ->where('message_id', 'wamid.mirror.keep-media')
            ->first();

        $this->assertSame(
            $tenant->id . '/whatsapp/attachments/kept.jpg',
            data_get($stored->raw, 'request.attachment_path')
        );
        $this->assertNull(data_get($stored->raw, 'message.media.base64'));
    }

    public function test_send_media_endpoint_stores_attachment_and_lists_image_url(): void
    {
        Event::fake([InboundWhatsappMessage::class]);
        Storage::fake('tenants');

        $tenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);

        \App\Models\WhatsappSetting::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'status' => true,
        ]);

        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
        ]);

        Http::fake([
            'http://wa-mirror.test/sessions/*/send-media' => Http::response([
                'messageId' => 'wamid.mirror.crm-photo',
            ], 200),
        ]);

        Sanctum::actingAs($user);

        $this->post('/api/v1/whatsapp/send-media', [
            'recipient_number' => '201001234567',
            'caption' => 'from crm',
            'attachment' => UploadedFile::fake()->create('hello.jpg', 20, 'image/jpeg'),
        ], [
            'Accept' => 'application/json',
        ])->assertOk()->assertJsonPath('success', true);

        $stored = WhatsappMessage::query()
            ->where('message_id', 'wamid.mirror.crm-photo')
            ->first();
        $this->assertNotNull($stored);
        $this->assertSame('image', $stored->type);
        $this->assertNotEmpty(data_get($stored->raw, 'request.attachment_path'));

        $list = $this->getJson('/api/whatsapp-mirror/conversation-messages?phone=201001234567');
        $list->assertOk();
        $item = collect($list->json('data'))->firstWhere('message_id', 'wamid.mirror.crm-photo');
        $this->assertNotNull($item);
        $this->assertSame('image', $item['media']['type'] ?? null);
        $this->assertStringStartsWith('/', $item['media']['url'] ?? '');
    }

    public function test_conversations_list_ignores_huge_raw_payloads(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);

        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
        ]);

        WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'source' => 'live',
            'direction' => 'inbound',
            'from' => '201001234567',
            'to' => '201099999999',
            'type' => 'image',
            'status' => 'received',
            'message_id' => 'wamid.mirror.huge-raw',
            'body' => 'photo',
            'raw' => [
                'message' => [
                    'media' => [
                        'base64' => str_repeat('A', 250000),
                    ],
                ],
            ],
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/whatsapp-mirror/conversations?page=1&per_page=20')
            ->assertOk()
            ->assertJsonPath('data.0.phone', '201001234567');
    }
}
