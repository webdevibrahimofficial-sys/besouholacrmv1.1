<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\WhatsappMessage;
use App\Models\WhatsappSetting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WhatsappSenderTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_run_real_whatsapp_connection_test()
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'job_title' => 'Admin']);
        WhatsappSetting::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'api_key' => 'saved-access-token',
            'phone_number_id' => 'PHONE_123',
            'status' => true,
        ]);

        Sanctum::actingAs($user);

        Http::fake([
            'https://graph.facebook.com/v18.0/PHONE_123*' => Http::response([
                'id' => 'PHONE_123',
                'display_phone_number' => '+201000000000',
                'verified_name' => 'Be Souhola',
            ], 200),
        ]);

        $this->postJson('/api/whatsapp/send-test', [
            'api_key' => 'saved-access-token',
            'phone_number_id' => 'PHONE_123',
        ])->assertOk()->assertJsonPath('ok', true);

        Http::assertSent(function ($request) {
            return $request->method() === 'GET'
                && str_contains($request->url(), 'https://graph.facebook.com/v18.0/PHONE_123')
                && $request->hasHeader('Authorization', 'Bearer saved-access-token');
        });
    }

    public function test_non_admin_cannot_manage_whatsapp_settings()
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'job_title' => 'Agent']);

        Sanctum::actingAs($user);

        $this->getJson('/api/whatsapp-settings')->assertStatus(403);
        $this->putJson('/api/whatsapp-settings', ['provider' => 'meta'])->assertStatus(403);
        $this->getJson('/api/whatsapp-templates')->assertStatus(403);
        $this->postJson('/api/whatsapp/send-test', [])->assertStatus(403);
    }

    public function test_send_template_v1_passes_variables_to_meta_payload()
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'job_title' => 'Sales Admin']);
        WhatsappSetting::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'api_key' => 'test-access-token',
            'phone_number_id' => 'YOUR_DUMMY_PHONE_ID',
            'status' => true,
        ]);

        Sanctum::actingAs($user);

        Http::fake([
            'https://graph.facebook.com/v18.0/YOUR_DUMMY_PHONE_ID/messages' => Http::response([
                'messages' => [['id' => 'wamid.OUTBOUND123']],
            ], 200),
        ]);

        $this->postJson('/api/v1/whatsapp/send-template', [
            'recipient_number' => '201001234567',
            'template_name' => 'hello_world',
            'language' => 'en_US',
            'variables' => ['Ibrahim', 'Pipeline'],
        ])->assertOk()->assertJsonPath('ok', true);

        Http::assertSent(function ($request) {
            return $request->method() === 'POST'
                && $request->url() === 'https://graph.facebook.com/v18.0/YOUR_DUMMY_PHONE_ID/messages'
                && data_get($request->data(), 'template.name') === 'hello_world'
                && data_get($request->data(), 'template.language.code') === 'en_US'
                && data_get($request->data(), 'template.components.0.parameters.0.text') === 'Ibrahim'
                && data_get($request->data(), 'template.components.0.parameters.1.text') === 'Pipeline';
        });

        $this->assertDatabaseHas('whatsapp_messages', [
            'tenant_id' => $tenant->id,
            'message_id' => 'wamid.OUTBOUND123',
            'direction' => 'outbound',
            'type' => 'template',
        ]);
    }

    public function test_settings_show_masks_sensitive_tokens_and_blank_update_preserves_them()
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'job_title' => 'Admin']);

        WhatsappSetting::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'api_key' => 'super-secret-access-token',
            'api_secret' => 'super-secret-phone-id',
            'phone_number_id' => 'phone-id-123',
            'status' => true,
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/whatsapp-settings')
            ->assertOk()
            ->assertJsonPath('api_key', null)
            ->assertJsonPath('api_secret', null)
            ->assertJsonPath('has_api_key', true)
            ->assertJsonPath('api_key_masked', '*********************oken');

        $this->putJson('/api/whatsapp-settings', [
            'provider' => 'meta',
            'api_key' => '',
            'api_secret' => '',
            'business_number' => '+201000000000',
            'phone_number_id' => 'phone-id-123',
            'business_account_id' => 'biz-1',
            'status' => true,
        ])->assertOk();

        $setting = WhatsappSetting::where('tenant_id', $tenant->id)->firstOrFail();
        $this->assertSame('super-secret-access-token', $setting->api_key);
        $this->assertSame('super-secret-phone-id', $setting->api_secret);
    }
}
