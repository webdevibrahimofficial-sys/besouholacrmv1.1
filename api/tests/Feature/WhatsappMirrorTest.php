<?php

namespace Tests\Feature;

use App\Events\InboundWhatsappMessage;
use App\Jobs\ProcessHistorySyncBatch;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\WhatsappMessage;
use App\Models\WhatsappMirrorSession;
use App\Services\Whatsapp\WhatsappMirrorProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
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
}
