<?php

namespace Tests\Feature;

use App\Events\InboundWhatsappMessage;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WhatsappGroupContact;
use App\Models\WhatsappMessage;
use App\Models\WhatsappMirrorSession;
use App\Models\WhatsappSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsappMirrorIntegrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.wa_mirror.token', 'mirror-test-token');
        config()->set('services.wa_mirror.url', 'http://127.0.0.1:3000');
    }

    public function test_mirror_send_text_reuses_existing_echoed_message_row(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);

        WhatsappSetting::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'status' => true,
        ]);

        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'phone' => '01001234567',
        ]);

        $existing = WhatsappMessage::create([
            'tenant_id' => $tenant->id,
            'provider' => 'mirror',
            'source' => 'live',
            'direction' => 'outbound',
            'from' => '201099999999',
            'to' => '201001234567',
            'type' => 'text',
            'status' => 'sent',
            'message_id' => 'mirror-msg-123',
            'body' => 'Hello mirror',
            'lead_id' => $lead->id,
        ]);

        Sanctum::actingAs($user);

        Http::fake([
            'http://127.0.0.1:3000/sessions/*/send' => Http::response([
                'messageId' => 'mirror-msg-123',
            ], 200),
        ]);

        $this->postJson('/api/v1/whatsapp/send-text', [
            'recipient_number' => '201001234567',
            'message_body' => 'Hello mirror',
        ])->assertOk()
            ->assertJsonPath('message_id', 'mirror-msg-123')
            ->assertJsonPath('db_id', $existing->id);

        $this->assertSame(
            1,
            WhatsappMessage::where('tenant_id', $tenant->id)
                ->where('message_id', 'mirror-msg-123')
                ->count()
        );
    }

    public function test_history_sync_sets_fallback_timestamp_and_does_not_broadcast_old_messages(): void
    {
        Event::fake([InboundWhatsappMessage::class]);

        $tenant = Tenant::factory()->create();

        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
        ]);

        Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'phone' => '01001234567',
        ]);

        $this->withHeaders([
            'X-Internal-Token' => 'mirror-test-token',
        ])->postJson('/api/internal/whatsapp-mirror/history-sync', [
            'tenant_id' => $tenant->id,
            'messages' => [[
                'message_id' => 'history-1',
                'phone' => '201001234567',
                'body' => 'Old imported message',
                'from_me' => false,
            ]],
            'is_latest' => false,
        ])->assertOk()
            ->assertJsonPath('processed', 1);

        $session = WhatsappMirrorSession::where('tenant_id', $tenant->id)->firstOrFail();

        $this->assertNotNull($session->history_synced_at);
        Event::assertNotDispatched(InboundWhatsappMessage::class);
        $this->assertDatabaseHas('whatsapp_messages', [
            'tenant_id' => $tenant->id,
            'message_id' => 'history-1',
            'source' => 'history_sync',
        ]);
    }

    public function test_history_sync_fallback_prevents_reimport_after_guard_window(): void
    {
        $tenant = Tenant::factory()->create();

        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'connected',
            'connected_phone_number' => '201099999999',
        ]);

        Lead::factory()->create([
            'tenant_id' => $tenant->id,
            'phone' => '01001234567',
        ]);

        $headers = ['X-Internal-Token' => 'mirror-test-token'];

        $this->withHeaders($headers)->postJson('/api/internal/whatsapp-mirror/history-sync', [
            'tenant_id' => $tenant->id,
            'messages' => [[
                'message_id' => 'history-first',
                'phone' => '201001234567',
                'body' => 'First sync message',
                'from_me' => false,
            ]],
            'is_latest' => false,
        ])->assertOk();

        $this->travel(6)->minutes();

        $this->withHeaders($headers)->postJson('/api/internal/whatsapp-mirror/history-sync', [
            'tenant_id' => $tenant->id,
            'messages' => [[
                'message_id' => 'history-second',
                'phone' => '201001234567',
                'body' => 'Should be skipped',
                'from_me' => false,
            ]],
            'is_latest' => false,
        ])->assertOk()
            ->assertJsonPath('skipped', true);

        $this->assertDatabaseMissing('whatsapp_messages', [
            'tenant_id' => $tenant->id,
            'message_id' => 'history-second',
        ]);
    }

    public function test_status_reports_reconnecting_only_within_grace_window(): void
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
            'last_connected_at' => now()->subMinutes(5),
            'last_disconnected_at' => now()->subSeconds(8),
        ]);

        Sanctum::actingAs($user);

        Http::fake([
            'http://127.0.0.1:3000/sessions/*/status' => Http::response([
                'status' => 'disconnected',
            ], 200),
        ]);

        $this->getJson('/api/whatsapp-mirror/status')
            ->assertOk()
            ->assertJsonPath('status', 'reconnecting');

        $this->assertSame(
            'reconnecting',
            WhatsappMirrorSession::where('tenant_id', $tenant->id)->value('status')
        );
    }

    public function test_status_marks_reconnect_failed_after_grace_window_expires(): void
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
            'last_connected_at' => now()->subMinutes(5),
            'last_disconnected_at' => now()->subSeconds(45),
        ]);

        Sanctum::actingAs($user);

        Http::fake([
            'http://127.0.0.1:3000/sessions/*/status' => Http::response([
                'status' => 'disconnected',
            ], 200),
        ]);

        $this->getJson('/api/whatsapp-mirror/status')
            ->assertOk()
            ->assertJsonPath('status', 'reconnect_failed');

        $this->assertSame(
            'reconnect_failed',
            WhatsappMirrorSession::where('tenant_id', $tenant->id)->value('status')
        );
    }

    public function test_status_exposes_reconnect_reason_and_detail(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);

        WhatsappMirrorSession::create([
            'tenant_id' => $tenant->id,
            'status' => 'reconnect_failed',
            'connected_phone_number' => '201099999999',
            'last_connected_at' => now()->subMinutes(5),
            'last_disconnected_at' => now()->subMinute(),
            'reconnect_reason' => 'session_conflict',
            'reconnect_detail' => 'WhatsApp reported a session conflict during the last reconnect attempt.',
        ]);

        Sanctum::actingAs($user);

        Http::fake([
            'http://127.0.0.1:3000/sessions/*/status' => Http::response([
                'status' => 'disconnected',
            ], 200),
        ]);

        $this->getJson('/api/whatsapp-mirror/status')
            ->assertOk()
            ->assertJsonPath('status', 'reconnect_failed')
            ->assertJsonPath('reconnect_reason', 'session_conflict')
            ->assertJsonPath('reconnect_detail', 'WhatsApp reported a session conflict during the last reconnect attempt.');
    }

    public function test_group_contact_conversion_rejects_poisoned_lid_phone_even_if_unresolved_flag_is_false(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'job_title' => 'Admin',
        ]);

        $contact = WhatsappGroupContact::create([
            'tenant_id' => $tenant->id,
            'group_jid' => '120363000000000002@g.us',
            'group_name' => 'Poisoned Group',
            'participant_jid' => '113563565879363@lid',
            'lid' => '113563565879363',
            'phone' => '113563565879363',
            'resolved_phone' => null,
            'is_unresolved_lid' => false,
            'status' => 'pending',
        ]);

        Sanctum::actingAs($user);

        $this->postJson("/api/whatsapp-mirror/group-contacts/{$contact->id}/convert-to-lead", [
            'name' => 'Should Be Rejected',
        ])->assertStatus(422)
            ->assertJsonPath('message', 'This group member still has an unresolved WhatsApp LID. Wait until the real phone number is resolved before converting.');
    }
}
