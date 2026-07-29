<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\WhatsappChannel;
use App\Models\WhatsappMessage;
use App\Models\WhatsappSetting;
use App\Services\Whatsapp\WhatsappChannelService;
use App\Services\Whatsapp\WhatsappInboundService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Sanctum;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class WhatsappChannelsTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    protected Tenant $tenant;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'job_title' => 'Admin',
        ]);
    }

    public function test_channel_backfill_from_settings_on_update(): void
    {
        Sanctum::actingAs($this->admin);

        $this->putJson('/api/whatsapp-settings', [
            'provider' => 'meta',
            'api_key' => 'test-token-value',
            'phone_number_id' => 'PHONE_999',
            'business_number' => '+201234567890',
            'business_account_id' => 'WABA_1',
            'status' => true,
        ])->assertOk();

        $this->assertDatabaseHas('whatsapp_channels', [
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'phone_number_id' => 'PHONE_999',
            'normalized_phone' => '201234567890',
        ]);
    }

    public function test_set_primary_unsets_other_channels(): void
    {
        $first = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'display_name' => 'Cloud 1',
            'phone_number_id' => 'PHONE_A',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => true,
            'supports_ctwa_attribution' => true,
        ]);

        $second = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_MIRROR,
            'display_name' => 'Mirror',
            'normalized_phone' => '209999999999',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => false,
        ]);

        app(WhatsappChannelService::class)->setPrimary($this->tenant->id, $second->id);

        $this->assertFalse($first->fresh()->is_primary);
        $this->assertTrue($second->fresh()->is_primary);
        $this->assertSame(1, WhatsappChannel::query()
            ->where('tenant_id', $this->tenant->id)
            ->where('is_primary', true)
            ->count());
    }

    public function test_conflict_rejects_same_phone_on_different_providers(): void
    {
        WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_MIRROR,
            'display_name' => 'Mirror',
            'normalized_phone' => '201111111111',
            'status' => WhatsappChannel::STATUS_CONNECTED,
        ]);

        Sanctum::actingAs($this->admin);

        $this->putJson('/api/whatsapp-settings', [
            'provider' => 'meta',
            'api_key' => 'token',
            'phone_number_id' => 'PHONE_X',
            'business_number' => '+201111111111',
            'status' => true,
        ])->assertStatus(422);
    }

    public function test_inbound_service_records_unassigned_contact_for_unknown_number(): void
    {
        WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'phone_number_id' => 'PHONE_INBOUND',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'supports_ctwa_attribution' => true,
        ]);

        app(WhatsappInboundService::class)->handlePayload([
            'object' => 'whatsapp_business_account',
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'metadata' => ['phone_number_id' => 'PHONE_INBOUND'],
                        'messages' => [[
                            'id' => 'wamid.TEST123',
                            'from' => '201555555555',
                            'type' => 'text',
                            'text' => ['body' => 'Hello from ad'],
                            'referral' => [
                                'source_id' => 'ad_123',
                                'source_type' => 'ad',
                                'ctwa_clid' => 'clid_abc',
                            ],
                        ]],
                    ],
                ]],
            ]],
        ]);

        $this->assertDatabaseHas('whatsapp_messages', [
            'tenant_id' => $this->tenant->id,
            'message_id' => 'wamid.TEST123',
            'from' => '201555555555',
        ]);

        $this->assertDatabaseHas('whatsapp_unassigned_contacts', [
            'tenant_id' => $this->tenant->id,
            'phone' => '201555555555',
            'status' => 'pending',
        ]);

        $this->assertDatabaseHas('whatsapp_message_attributions', [
            'tenant_id' => $this->tenant->id,
            'source_id' => 'ad_123',
            'ctwa_clid' => 'clid_abc',
        ]);
    }

    public function test_ctwa_auto_create_lead_when_flag_enabled(): void
    {
        WhatsappSetting::create([
            'tenant_id' => $this->tenant->id,
            'provider' => 'meta',
            'status' => true,
            'auto_create_ctwa_leads' => true,
        ]);

        WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'phone_number_id' => 'PHONE_CTWA_AUTO',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'supports_ctwa_attribution' => true,
        ]);

        app(WhatsappInboundService::class)->handlePayload([
            'object' => 'whatsapp_business_account',
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'metadata' => ['phone_number_id' => 'PHONE_CTWA_AUTO'],
                        'messages' => [[
                            'id' => 'wamid.CTWA1',
                            'from' => '201666666661',
                            'type' => 'text',
                            'text' => ['body' => 'From ad'],
                            'referral' => [
                                'source_id' => 'ad_auto_1',
                                'source_type' => 'ad',
                                'ctwa_clid' => 'clid_1',
                                'headline' => 'Summer Offer',
                            ],
                        ]],
                    ],
                ]],
            ]],
        ]);

        $this->assertDatabaseHas('leads', [
            'tenant_id' => $this->tenant->id,
            'phone' => '01666666661',
            'source' => 'WhatsApp CTWA',
        ]);
        $this->assertDatabaseHas('whatsapp_unassigned_contacts', [
            'tenant_id' => $this->tenant->id,
            'phone' => '201666666661',
            'status' => 'converted',
        ]);
        $this->assertDatabaseHas('whatsapp_message_attributions', [
            'tenant_id' => $this->tenant->id,
            'source_id' => 'ad_auto_1',
        ]);
        $this->assertNotNull(
            \App\Models\WhatsappMessageAttribution::query()
                ->where('tenant_id', $this->tenant->id)
                ->where('source_id', 'ad_auto_1')
                ->whereNotNull('lead_id')
                ->first()
        );
    }

    public function test_ctwa_auto_create_is_idempotent_for_second_referral_message(): void
    {
        WhatsappSetting::create([
            'tenant_id' => $this->tenant->id,
            'provider' => 'meta',
            'status' => true,
            'auto_create_ctwa_leads' => true,
        ]);

        WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'phone_number_id' => 'PHONE_CTWA_IDEM',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'supports_ctwa_attribution' => true,
        ]);

        $payloadFor = fn (string $messageId, string $sourceId) => [
            'object' => 'whatsapp_business_account',
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'metadata' => ['phone_number_id' => 'PHONE_CTWA_IDEM'],
                        'messages' => [[
                            'id' => $messageId,
                            'from' => '201666666662',
                            'type' => 'text',
                            'text' => ['body' => 'Again'],
                            'referral' => [
                                'source_id' => $sourceId,
                                'source_type' => 'ad',
                                'ctwa_clid' => 'clid_2',
                            ],
                        ]],
                    ],
                ]],
            ]],
        ];

        app(WhatsappInboundService::class)->handlePayload($payloadFor('wamid.CTWA_A', 'ad_a'));
        app(WhatsappInboundService::class)->handlePayload($payloadFor('wamid.CTWA_B', 'ad_b'));

        $this->assertSame(
            1,
            \App\Models\Lead::query()
                ->where('tenant_id', $this->tenant->id)
                ->count()
        );
        $this->assertNotNull(
            \App\Support\LeadPhoneMatcher::findLeadByPhone((int) $this->tenant->id, '201666666662')
        );
    }

    public function test_ctwa_auto_create_skips_when_lead_already_exists(): void
    {
        WhatsappSetting::create([
            'tenant_id' => $this->tenant->id,
            'provider' => 'meta',
            'status' => true,
            'auto_create_ctwa_leads' => true,
        ]);

        WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'phone_number_id' => 'PHONE_CTWA_EXIST',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'supports_ctwa_attribution' => true,
        ]);

        $existing = \App\Models\Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'phone' => '201666666663',
            'name' => 'Existing',
        ]);

        app(WhatsappInboundService::class)->handlePayload([
            'object' => 'whatsapp_business_account',
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'metadata' => ['phone_number_id' => 'PHONE_CTWA_EXIST'],
                        'messages' => [[
                            'id' => 'wamid.CTWA_EXIST',
                            'from' => '201666666663',
                            'type' => 'text',
                            'text' => ['body' => 'Hi'],
                            'referral' => [
                                'source_id' => 'ad_exist',
                                'source_type' => 'ad',
                                'ctwa_clid' => 'clid_3',
                            ],
                        ]],
                    ],
                ]],
            ]],
        ]);

        $this->assertSame(
            1,
            \App\Models\Lead::query()
                ->where('tenant_id', $this->tenant->id)
                ->where('phone', '201666666663')
                ->count()
        );
        $this->assertDatabaseHas('whatsapp_messages', [
            'message_id' => 'wamid.CTWA_EXIST',
            'lead_id' => $existing->id,
        ]);
    }

    public function test_whatsapp_oauth_redirect_disabled_by_default(): void
    {
        config(['services.whatsapp.oauth_enabled' => false]);
        Sanctum::actingAs($this->admin);

        $this->getJson('/api/auth/whatsapp/redirect')
            ->assertStatus(422)
            ->assertJsonPath('oauth_enabled', false);
    }

    public function test_whatsapp_oauth_status_reports_connect_mode(): void
    {
        config([
            'services.whatsapp.oauth_enabled' => true,
            'services.whatsapp.embedded_signup_config_id' => 'CONFIG_123',
        ]);
        Sanctum::actingAs($this->admin);

        $this->getJson('/api/auth/whatsapp/status')
            ->assertOk()
            ->assertJsonPath('whatsapp_oauth_enabled', true)
            ->assertJsonPath('embedded_signup_config_id', 'CONFIG_123')
            ->assertJsonPath('connect_mode', 'embedded_signup');
    }

    public function test_embedded_signup_complete_persists_channel(): void
    {
        $this->seedSharedMetaApp();
        config(['services.whatsapp.oauth_enabled' => true]);
        Sanctum::actingAs($this->admin);

        Http::fake([
            'https://graph.facebook.com/*/oauth/access_token' => Http::response([
                'access_token' => 'embedded-access-token',
                'token_type' => 'bearer',
            ], 200),
        ]);

        $this->postJson('/api/auth/whatsapp/embedded-signup', [
            'code' => 'embedded-code',
            'phone_number_id' => 'PHONE_ES_1',
            'waba_id' => 'WABA_ES_1',
            'display_phone_number' => '+201099988877',
            'verified_name' => 'Demo Biz',
        ])->assertOk()->assertJsonPath('ok', true);

        $this->assertDatabaseHas('whatsapp_channels', [
            'tenant_id' => $this->tenant->id,
            'phone_number_id' => 'PHONE_ES_1',
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'status' => WhatsappChannel::STATUS_CONNECTED,
        ]);

        $this->assertDatabaseHas('whatsapp_settings', [
            'tenant_id' => $this->tenant->id,
            'phone_number_id' => 'PHONE_ES_1',
            'provider' => 'meta',
        ]);
    }

    public function test_migration_complete_blocked_without_test_message(): void
    {
        $service = app(WhatsappChannelService::class);

        $mirror = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_MIRROR,
            'display_name' => 'Mirror',
            'normalized_phone' => '201222222222',
            'phone_number' => '+201222222222',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => true,
            'supports_inbound' => true,
            'supports_outbound' => true,
        ]);

        $cloud = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'display_name' => 'Cloud',
            'phone_number_id' => 'PHONE_MIGRATE',
            'normalized_phone' => '201333333333',
            'phone_number' => '+201333333333',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => false,
            'supports_ctwa_attribution' => true,
            'access_token' => 'cloud-token',
        ]);

        WhatsappMessage::create([
            'tenant_id' => $this->tenant->id,
            'channel_id' => $mirror->id,
            'provider' => 'mirror',
            'from' => '201444444444',
            'to' => '201222222222',
            'type' => 'text',
            'direction' => 'inbound',
            'status' => 'received',
            'message_id' => 'mirror-msg-1',
            'body' => 'history message',
        ]);

        $started = $service->startMigration($this->tenant->id, $mirror->id, $cloud->id);
        $this->assertSame(WhatsappChannel::STATUS_MIGRATING, $started['mirror']->status);
        $this->assertSame(WhatsappChannel::STATUS_CONNECTING, $started['cloud']->status);

        $this->expectException(ValidationException::class);
        $service->completeMigration($this->tenant->id, $mirror->id, $cloud->id);
    }

    public function test_migration_complete_requires_test_then_archives_mirror(): void
    {
        $service = app(WhatsappChannelService::class);

        $mirror = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_MIRROR,
            'display_name' => 'Mirror',
            'normalized_phone' => '201222222222',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => true,
        ]);

        $cloud = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'display_name' => 'Cloud',
            'phone_number_id' => 'PHONE_MIGRATE_2',
            'normalized_phone' => '201333333333',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'supports_ctwa_attribution' => true,
            'access_token' => 'cloud-token',
        ]);

        $history = WhatsappMessage::create([
            'tenant_id' => $this->tenant->id,
            'channel_id' => $mirror->id,
            'provider' => 'mirror',
            'from' => '201444444444',
            'direction' => 'inbound',
            'status' => 'received',
            'message_id' => 'mirror-history-2',
            'body' => 'keep me',
        ]);

        $service->startMigration($this->tenant->id, $mirror->id, $cloud->id);
        $service->markMigrationTestReceived($cloud->fresh());

        $result = $service->completeMigration($this->tenant->id, $mirror->id, $cloud->id);

        $this->assertSame(WhatsappChannel::STATUS_ARCHIVED, $result['mirror']->status);
        $this->assertSame(WhatsappChannel::STATUS_CONNECTED, $result['cloud']->status);
        $this->assertTrue($result['cloud']->is_primary);
        $this->assertFalse($result['mirror']->is_primary);
        $this->assertFalse($result['mirror']->supports_inbound);
        $this->assertFalse($result['mirror']->supports_outbound);

        $this->assertDatabaseHas('whatsapp_messages', [
            'id' => $history->id,
            'channel_id' => $mirror->id,
            'body' => 'keep me',
        ]);
    }

    public function test_reconcile_command_is_registered_and_runs(): void
    {
        $exit = Artisan::call('whatsapp:reconcile-channels');
        $this->assertSame(0, $exit);
    }

    public function test_meta_webhook_dispatches_whatsapp_business_account_object(): void
    {
        config(['services.meta.mock_mode' => true]);

        WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'phone_number_id' => 'PHONE_META_WH',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'supports_ctwa_attribution' => true,
        ]);

        $payload = [
            'object' => 'whatsapp_business_account',
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'metadata' => ['phone_number_id' => 'PHONE_META_WH'],
                        'messages' => [[
                            'id' => 'wamid.META_DISPATCH',
                            'from' => '201666666666',
                            'type' => 'text',
                            'text' => ['body' => 'via meta webhook'],
                        ]],
                    ],
                ]],
            ]],
        ];

        $this->postJson('/api/meta/webhook', $payload)
            ->assertOk();

        $this->assertDatabaseHas('whatsapp_messages', [
            'tenant_id' => $this->tenant->id,
            'message_id' => 'wamid.META_DISPATCH',
            'body' => 'via meta webhook',
        ]);

        $this->assertDatabaseHas('whatsapp_unassigned_contacts', [
            'tenant_id' => $this->tenant->id,
            'phone' => '201666666666',
            'status' => 'pending',
        ]);
    }

    public function test_inbound_marks_migration_verification_when_pending(): void
    {
        $channel = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'phone_number_id' => 'PHONE_VERIFY',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'access_token' => 'token',
            'supports_ctwa_attribution' => true,
            'metadata' => [
                'migration_verification_pending' => true,
                'migration_verification_sent_to' => '201777777777',
            ],
        ]);

        app(WhatsappInboundService::class)->handlePayload([
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'metadata' => ['phone_number_id' => 'PHONE_VERIFY'],
                        'messages' => [[
                            'id' => 'wamid.VERIFY_REPLY',
                            'from' => '201777777777',
                            'type' => 'text',
                            'text' => ['body' => 'yes'],
                        ]],
                    ],
                ]],
            ]],
        ]);

        $channel->refresh();
        $this->assertTrue((bool) data_get($channel->metadata, 'migration_test_received'));
        $this->assertFalse((bool) data_get($channel->metadata, 'migration_verification_pending'));
    }

    public function test_resolve_outbound_uses_latest_connected_message_channel(): void
    {
        $mirror = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_MIRROR,
            'display_name' => 'Mirror',
            'normalized_phone' => '201111111111',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => false,
            'supports_outbound' => true,
        ]);
        $cloud = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'display_name' => 'Cloud Primary',
            'normalized_phone' => '201222222222',
            'phone_number_id' => 'PHONE_CLOUD_1',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => true,
            'supports_outbound' => true,
        ]);

        WhatsappMessage::create([
            'tenant_id' => $this->tenant->id,
            'channel_id' => $mirror->id,
            'provider' => 'mirror',
            'direction' => 'inbound',
            'from' => '201000000001',
            'to' => '201111111111',
            'body' => 'hi',
            'status' => 'received',
            'created_at' => now()->subMinute(),
        ]);

        $resolved = app(WhatsappChannelService::class)->resolveOutboundChannelId(
            (int) $this->tenant->id,
            '201000000001'
        );

        $this->assertSame($mirror->id, $resolved);
        $this->assertNotSame($cloud->id, $resolved);
    }

    public function test_resolve_outbound_skips_archived_channel_for_primary(): void
    {
        $archived = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_MIRROR,
            'display_name' => 'Old Mirror',
            'normalized_phone' => '201111111111',
            'status' => WhatsappChannel::STATUS_ARCHIVED,
            'is_primary' => false,
            'supports_outbound' => true,
        ]);
        $primary = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'display_name' => 'Cloud',
            'normalized_phone' => '201222222222',
            'phone_number_id' => 'PHONE_CLOUD_2',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => true,
            'supports_outbound' => true,
        ]);

        WhatsappMessage::create([
            'tenant_id' => $this->tenant->id,
            'channel_id' => $archived->id,
            'provider' => 'mirror',
            'direction' => 'inbound',
            'from' => '201000000002',
            'body' => 'hi',
            'status' => 'received',
            'created_at' => now(),
        ]);

        $resolved = app(WhatsappChannelService::class)->resolveOutboundChannelId(
            (int) $this->tenant->id,
            '201000000002'
        );

        $this->assertSame($primary->id, $resolved);
    }

    public function test_resolve_outbound_orders_by_created_at_not_id(): void
    {
        $olderChannel = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_MIRROR,
            'display_name' => 'Mirror',
            'normalized_phone' => '201111111113',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => false,
            'supports_outbound' => true,
        ]);
        $newerChannel = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'display_name' => 'Cloud',
            'normalized_phone' => '201222222223',
            'phone_number_id' => 'PHONE_CLOUD_3',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => true,
            'supports_outbound' => true,
        ]);

        $newerMsg = WhatsappMessage::create([
            'tenant_id' => $this->tenant->id,
            'channel_id' => $newerChannel->id,
            'provider' => 'meta',
            'direction' => 'inbound',
            'from' => '201000000003',
            'body' => 'newer',
            'status' => 'received',
        ]);
        $newerMsg->forceFill(['created_at' => now()->subSeconds(10), 'updated_at' => now()->subSeconds(10)])->save();

        $olderMsg = WhatsappMessage::create([
            'tenant_id' => $this->tenant->id,
            'channel_id' => $olderChannel->id,
            'provider' => 'mirror',
            'direction' => 'inbound',
            'from' => '201000000003',
            'body' => 'older-but-higher-id',
            'status' => 'received',
        ]);
        $olderMsg->forceFill(['created_at' => now()->subMinutes(5), 'updated_at' => now()->subMinutes(5)])->save();

        $this->assertGreaterThan($newerMsg->id, $olderMsg->id);

        $resolved = app(WhatsappChannelService::class)->resolveOutboundChannelId(
            (int) $this->tenant->id,
            '201000000003'
        );

        $this->assertSame($newerChannel->id, $resolved);
    }

    public function test_send_text_v1_routes_to_history_channel_not_primary(): void
    {
        \Illuminate\Support\Facades\Event::fake([\App\Events\InboundWhatsappMessage::class]);

        config()->set('services.wa_mirror.token', 'mirror-test-token');
        config()->set('services.wa_mirror.url', 'http://127.0.0.1:3000');

        Sanctum::actingAs($this->admin);

        $mirror = WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_MIRROR,
            'display_name' => 'Mirror',
            'normalized_phone' => '201111111114',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => false,
            'supports_outbound' => true,
        ]);
        WhatsappChannel::create([
            'tenant_id' => $this->tenant->id,
            'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
            'display_name' => 'Cloud Primary',
            'normalized_phone' => '201222222224',
            'phone_number_id' => 'PHONE_CLOUD_4',
            'access_token' => 'cloud-token',
            'status' => WhatsappChannel::STATUS_CONNECTED,
            'is_primary' => true,
            'supports_outbound' => true,
        ]);

        WhatsappMessage::create([
            'tenant_id' => $this->tenant->id,
            'channel_id' => $mirror->id,
            'provider' => 'mirror',
            'direction' => 'inbound',
            'from' => '201000000004',
            'body' => 'hi',
            'status' => 'received',
        ]);

        \Illuminate\Support\Facades\Http::fake([
            'http://127.0.0.1:3000/sessions/*/send' => \Illuminate\Support\Facades\Http::response([
                'messageId' => 'm-out-1',
            ], 200),
        ]);

        $this->postJson('/api/v1/whatsapp/send-text', [
            'recipient_number' => '201000000004',
            'message_body' => 'reply via mirror',
        ])->assertOk()->assertJsonPath('channel_id', $mirror->id);

        $this->assertDatabaseHas('whatsapp_messages', [
            'tenant_id' => $this->tenant->id,
            'direction' => 'outbound',
            'to' => '201000000004',
            'channel_id' => $mirror->id,
            'provider' => 'mirror',
        ]);
    }
}
