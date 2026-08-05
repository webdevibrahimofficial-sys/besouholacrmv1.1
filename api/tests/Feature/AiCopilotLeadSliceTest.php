<?php

namespace Tests\Feature;

use App\Models\CrmSetting;
use App\Models\Feature;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantFeatureService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AiCopilotLeadSliceTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $user;
    protected int $itemId;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        config(['activitylog.enabled' => false]);
        $this->ensureFeatureTables();
        $this->ensureCopilotTables();
        $this->ensureTenantDedicatedConnection();

        $this->tenant = Tenant::factory()->create([
            'name' => 'Copilot Tenant',
            'slug' => 'copilot-tenant',
            'domain' => 'copilot-tenant.localhost',
            'company_type' => 'general',
        ]);

        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'email' => 'copilot-lead@example.com',
        ]);

        Feature::firstOrCreate([
            'key' => 'besouhola_copilot',
        ], [
            'name' => 'Besouhola Copilot',
            'description' => 'AI copilot',
            'is_active' => true,
        ]);

        app(TenantFeatureService::class)->enableFeature($this->tenant, 'besouhola_copilot');

        CrmSetting::create([
            'tenant_id' => $this->tenant->id,
            'settings' => [
                'duplicationSystem' => true,
            ],
        ]);

        \App\Models\Stage::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'New Lead',
            'name_ar' => 'New Lead',
            'type' => 'new_lead',
            'workflow_key' => 'sales',
            'is_active' => true,
            'order' => 1,
            'color' => '#3B82F6',
            'icon' => 'BarChart2',
        ]);

        DB::table('sources')->insert([
            'tenant_id' => $this->tenant->id,
            'name' => 'Facebook',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->itemId = (int) DB::table('items')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Starter Package',
            'code' => 'starter-package',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_general_company_requires_source_and_item_when_missing(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'create lead name Ahmed phone 01012345678 email ahmed@example.com',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'create_lead_draft')
            ->assertJsonPath('data.tool_result.state', 'needs_input')
            ->assertJsonPath('data.tool_result.resource', 'lead')
            ->assertJsonPath('data.tool_result.payload.name', 'Ahmed')
            ->assertJsonPath('data.tool_result.payload.phone', '01012345678')
            ->assertJsonPath('data.tool_result.payload.email', 'ahmed@example.com')
            ->assertJsonPath('data.tool_result.missing_fields.0', 'source')
            ->assertJsonPath('data.tool_result.missing_fields.1', 'item')
            ->assertJsonPath('data.ui_actions.0.type', 'form')
            ->assertJsonPath('data.ui_actions.0.fields.0.name', 'name')
            ->assertJsonPath('data.ui_actions.0.fields.2.name', 'source')
            ->assertJsonPath('data.ui_actions.0.fields.3.name', 'item_id');
    }

    public function test_awaiting_confirmation_can_start_optional_question_flow(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => "create lead name Ahmed phone 01012345678 source Facebook item {$this->itemId}",
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_confirmation')
            ->assertJsonPath('data.ui_actions.0.type', 'confirm_action')
            ->assertJsonPath('data.ui_actions.1.type', 'prompt_message')
            ->assertJsonPath('data.ui_actions.1.label', 'Add more details');

        $conversationId = (int) $response->json('data.conversation_id');

        $optional = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => '__copilot_optional_start__',
        ]);

        $optional->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_optional_input')
            ->assertJsonPath('data.tool_result.optional_step', 'secondary_phone')
            ->assertJsonPath('data.ui_actions.0.type', 'form')
            ->assertJsonPath('data.ui_actions.1.type', 'prompt_message')
            ->assertJsonPath('data.ui_actions.1.label', 'Skip');
    }

    public function test_optional_estimated_value_does_not_replace_lead_name(): void
    {
        $this->actingAsTenantUser();

        $draft = $this->postJson('/api/ai/copilot/chat', [
            'message' => "create lead name Ibrahim phone 01012345678 source Facebook item {$this->itemId}",
        ]);

        $conversationId = (int) $draft->json('data.conversation_id');

        $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => '__copilot_optional_start__',
        ]);

        $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => '__copilot_skip_optional__',
        ]);

        $estimated = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => "Create lead\nestimated_value: 200000",
        ]);

        $estimated->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_optional_input')
            ->assertJsonPath('data.tool_result.payload.name', 'Ibrahim')
            ->assertJsonPath('data.tool_result.payload.estimated_value', '200000');
    }
    public function test_secondary_phone_is_saved_to_lead_meta_for_listing(): void
    {
        $this->actingAsTenantUser();

        $draft = $this->postJson('/api/ai/copilot/chat', [
            'message' => "create lead name Hazem phone 01555143125 source Facebook item {$this->itemId}",
        ]);

        $conversationId = (int) $draft->json('data.conversation_id');

        $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => '__copilot_optional_start__',
        ]);

        $withSecondary = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => "Create lead\nsecondary_phone: 01555143126",
        ]);

        $payload = $withSecondary->json('data.tool_result.payload');

        $response = $this->postJson('/api/ai/copilot/actions/confirm', [
            'action' => 'create_lead',
            'payload' => $payload,
        ]);

        $response->assertOk();

        $leadId = (int) $response->json('data.lead.id');
        $meta = DB::table('leads')->where('id', $leadId)->value('meta_data');
        $decoded = is_string($meta) ? json_decode($meta, true) : $meta;

        $this->assertSame('01555143126', (string) ($decoded['other_phone'] ?? ''));
        $this->assertSame('01555143126', (string) ($decoded['other_mobile'] ?? ''));
    }

    public function test_secondary_phone_message_does_not_override_primary_phone(): void
    {
        $this->actingAsTenantUser();

        $draft = $this->postJson('/api/ai/copilot/chat', [
            'message' => "create lead name Hazem phone 01555143125 source Facebook item {$this->itemId}",
        ]);

        $conversationId = (int) $draft->json('data.conversation_id');

        $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => '__copilot_optional_start__',
        ]);

        $withSecondary = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => "secondary_phone: 01555143126",
        ]);

        $withSecondary->assertOk()
            ->assertJsonPath('data.tool_result.payload.phone', '01555143125')
            ->assertJsonPath('data.tool_result.payload.secondary_phone', '01555143126');
    }

    public function test_multiline_create_lead_message_strips_name_label_from_arabic_name(): void
    {
        $this->actingAsTenantUser();

        $expectedName = json_decode('"\u0645\u062D\u0645\u0648\u062F"', true);
        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => "Create lead\nname: {$expectedName}\nphone: 01555258789\nsource: Facebook\nitem: {$this->itemId}",
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_confirmation')
            ->assertJsonPath('data.tool_result.payload.name', $expectedName)
            ->assertJsonPath('data.tool_result.payload.phone', '01555258789');
    }
    public function test_arabic_create_lead_phrase_stops_name_before_phone_and_source_keywords(): void
    {
        $this->actingAsTenantUser();

        $message = json_decode('"\u0627\u0639\u0645\u0644 \u0644\u064A\u062F \u0628\u0627\u0633\u0645 \u0645\u062D\u0645\u0648\u062F \u0648\u0631\u0642\u0645 01555143658 \u0633\u0648\u0631\u0633 Facebook \u0627\u064A\u062A\u0645 '.$this->itemId.'"', true);
        $expectedName = json_decode('"\u0645\u062D\u0645\u0648\u062F"', true);

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => $message,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'create_lead_draft')
            ->assertJsonPath('data.tool_result.state', 'awaiting_confirmation')
            ->assertJsonPath('data.tool_result.payload.name', $expectedName)
            ->assertJsonPath('data.tool_result.payload.phone', '01555143658')
            ->assertJsonPath('data.tool_result.payload.source', 'Facebook')
            ->assertJsonPath('data.tool_result.payload.item_id', $this->itemId);
    }
    public function test_arabic_name_stops_before_mobile_keyword(): void
    {
        $this->actingAsTenantUser();

        $message = json_decode('"\u0639\u0627\u064a\u0632 \u0627\u0646\u0634\u0626 \u0644\u064a\u062f \u0628\u0627\u0633\u0645 \u0627\u062d\u0645\u062f \u0645\u062d\u0645\u062f \u0645\u0648\u0628\u0627\u064a\u0644 01012345678 \u0627\u064a\u0645\u064a\u0644 ahmed@example.com"', true);
        $expectedName = json_decode('"\u0627\u062d\u0645\u062f \u0645\u062d\u0645\u062f"', true);

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => $message,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'create_lead_draft')
            ->assertJsonPath('data.tool_result.state', 'needs_input')
            ->assertJsonPath('data.tool_result.payload.name', $expectedName)
            ->assertJsonPath('data.tool_result.payload.phone', '01012345678')
            ->assertJsonPath('data.tool_result.payload.email', 'ahmed@example.com')
            ->assertJsonPath('data.tool_result.missing_fields.0', 'source')
            ->assertJsonPath('data.tool_result.missing_fields.1', 'item');
    }

    public function test_follow_up_message_completes_pending_source_and_item(): void
    {
        $this->actingAsTenantUser();

        $first = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'create lead name Ahmed phone 01012345678 email ahmed@example.com',
        ]);

        $conversationId = (int) $first->json('data.conversation_id');

        $second = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => "Facebook\n{$this->itemId}",
        ]);

        $second->assertOk()
            ->assertJsonPath('data.tool', 'create_lead_draft')
            ->assertJsonPath('data.tool_result.state', 'awaiting_confirmation')
            ->assertJsonPath('data.tool_result.payload.name', 'Ahmed')
            ->assertJsonPath('data.tool_result.payload.phone', '01012345678')
            ->assertJsonPath('data.tool_result.payload.source', 'Facebook')
            ->assertJsonPath('data.tool_result.payload.item_id', $this->itemId)
            ->assertJsonPath('data.ui_actions.0.action', 'create_lead');
    }

    public function test_rejects_unknown_source_for_tenant(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => "create lead name Ahmed phone 01012345678 source Unknown item {$this->itemId}",
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'create_lead_draft')
            ->assertJsonPath('data.tool_result.state', 'rejected')
            ->assertJsonPath('data.tool_result.message', 'Selected source does not exist for this tenant.')
            ->assertJsonPath('data.ui_actions.0.type', 'form');
    }

    public function test_real_estate_requires_project_and_accepts_project_name(): void
    {
        $tenant = Tenant::factory()->create([
            'name' => 'Real Estate Tenant',
            'slug' => 'real-estate-tenant',
            'domain' => 'real-estate-tenant.localhost',
            'company_type' => 'real_estate',
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => 'real-estate-copilot@example.com',
        ]);

        app(TenantFeatureService::class)->enableFeature($tenant, 'besouhola_copilot');

        CrmSetting::create([
            'tenant_id' => $tenant->id,
            'settings' => [
                'duplicationSystem' => true,
            ],
        ]);

        \App\Models\Stage::create([
            'tenant_id' => $tenant->id,
            'name' => 'New Lead',
            'name_ar' => 'New Lead',
            'type' => 'new_lead',
            'workflow_key' => 'sales',
            'is_active' => true,
            'order' => 1,
            'color' => '#3B82F6',
            'icon' => 'BarChart2',
        ]);

        DB::table('sources')->insert([
            'tenant_id' => $tenant->id,
            'name' => 'Website',
            'is_active' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('projects')->insert([
            'tenant_id' => $tenant->id,
            'name' => 'Skyline Residence',
            'country' => 'Egypt',
            'status' => 'Active',
            'units' => 0,
            'phases' => 0,
            'docs' => 0,
            'completion' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Sanctum::actingAs($user);
        app()->instance('tenant', $tenant);
        app()->instance('current_tenant_id', $tenant->id);

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'create lead name Mona phone 01099999999 source Website project Skyline Residence',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'create_lead_draft')
            ->assertJsonPath('data.tool_result.state', 'awaiting_confirmation')
            ->assertJsonPath('data.tool_result.payload.source', 'Website')
            ->assertJsonPath('data.tool_result.payload.project_id', 1)
            ->assertJsonMissingPath('data.tool_result.payload.item_id');
    }

    public function test_confirm_marks_duplicate_using_existing_lead_management_logic(): void
    {
        $this->actingAsTenantUser();

        $existingLeadId = DB::table('leads')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Existing Ahmed',
            'phone' => '+201012345678',
            'email' => 'existing@example.com',
            'source' => 'Facebook',
            'item_id' => $this->itemId,
            'stage' => 'New Lead',
            'stage_id' => 1,
            'workflow_key' => 'sales',
            'created_by' => $this->user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $draft = $this->postJson('/api/ai/copilot/chat', [
            'message' => "create lead name Ahmed phone 01012345678 email ahmed@example.com source Facebook item {$this->itemId}",
        ]);

        $payload = $draft->json('data.tool_result.payload');

        $response = $this->postJson('/api/ai/copilot/actions/confirm', [
            'action' => 'create_lead',
            'payload' => $payload,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.state', 'completed')
            ->assertJsonPath('data.resource', 'lead')
            ->assertJsonPath('data.ui_actions.1.type', 'prompt_message');

        $createdLeadId = (int) $response->json('data.lead.id');

        $this->assertDatabaseHas('leads', [
            'id' => $createdLeadId,
            'tenant_id' => $this->tenant->id,
            'status' => 'duplicate',
        ]);

        $duplicateMeta = DB::table('leads')->where('id', $createdLeadId)->value('meta_data');
        $decodedMeta = is_string($duplicateMeta) ? json_decode($duplicateMeta, true) : $duplicateMeta;

        $this->assertSame($existingLeadId, (int) ($decodedMeta['duplicate_of'] ?? 0));
    }

    public function test_lead_advice_uses_existing_tenant_items_only(): void
    {
        $this->actingAsTenantUser();

        $leadId = DB::table('leads')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Advice Lead',
            'phone' => '+201011111111',
            'email' => 'advice@example.com',
            'source' => 'Facebook',
            'item_id' => $this->itemId,
            'stage' => 'New Lead',
            'stage_id' => 1,
            'workflow_key' => 'sales',
            'created_by' => $this->user->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'Suggest the best tenant item or project and handling tips for lead '.$leadId,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.ui_actions.0.type', 'navigate');

        $this->assertStringContainsString('Starter Package', (string) $response->json('data.message'));
        $this->assertStringNotContainsString('Skyline Residence', (string) $response->json('data.message'));
    }

    protected function actingAsTenantUser(): void
    {
        Sanctum::actingAs($this->user);
        app()->instance('tenant', $this->tenant);
        app()->instance('current_tenant_id', $this->tenant->id);
    }

    protected function ensureFeatureTables(): void
    {
        if (! Schema::connection('landlord')->hasTable('features')) {
            Schema::connection('landlord')->create('features', function (Blueprint $table) {
                $table->id();
                $table->string('key')->unique();
                $table->string('name');
                $table->text('description')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::connection('landlord')->hasTable('tenant_features')) {
            Schema::connection('landlord')->create('tenant_features', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $table->foreignId('feature_id')->constrained('features')->cascadeOnDelete();
                $table->boolean('is_enabled')->default(false);
                $table->json('config')->nullable();
                $table->timestamp('enabled_at')->nullable();
                $table->timestamps();
                $table->unique(['tenant_id', 'feature_id']);
            });
        }

        if (! Schema::connection('landlord')->hasTable('subscription_plans')) {
            Schema::connection('landlord')->create('subscription_plans', function (Blueprint $table) {
                $table->id();
                $table->string('code')->unique();
                $table->string('name');
                $table->boolean('is_active')->default(true);
                $table->json('modules')->nullable();
                $table->json('company_type_overrides')->nullable();
                $table->timestamps();
            });
        }

        DB::connection('landlord')->table('subscription_plans')->updateOrInsert(
            ['code' => 'basic'],
            [
                'name' => 'Basic',
                'is_active' => true,
                'modules' => json_encode([]),
                'company_type_overrides' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    protected function ensureCopilotTables(): void
    {
        if (! Schema::hasTable('ai_copilot_conversations')) {
            Schema::create('ai_copilot_conversations', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tenant_id')->nullable()->index();
                $table->unsignedBigInteger('user_id')->index();
                $table->string('title')->nullable();
                $table->timestamp('last_message_at')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('ai_copilot_messages')) {
            Schema::create('ai_copilot_messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('conversation_id')->constrained('ai_copilot_conversations')->cascadeOnDelete();
                $table->string('role', 32);
                $table->text('content')->nullable();
                $table->string('tool_name')->nullable();
                $table->json('tool_payload')->nullable();
                $table->json('ui_actions')->nullable();
                $table->timestamps();
            });
        }
    }

    protected function ensureTenantDedicatedConnection(): void
    {
        $tenantDedicatedDb = storage_path('framework/testing/tenant-dedicated.sqlite');
        if (! is_dir(dirname($tenantDedicatedDb))) {
            mkdir(dirname($tenantDedicatedDb), 0777, true);
        }
        if (! file_exists($tenantDedicatedDb)) {
            touch($tenantDedicatedDb);
        }

        config([
            'database.connections.tenant-dedicated' => array_merge(
                config('database.connections.sqlite'),
                ['database' => $tenantDedicatedDb]
            ),
        ]);

        DB::purge('tenant-dedicated');

        if (! Schema::connection('tenant-dedicated')->hasTable('activity_log')) {
            Schema::connection('tenant-dedicated')->create('activity_log', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('log_name')->nullable();
                $table->text('description');
                $table->nullableMorphs('subject');
                $table->nullableMorphs('causer');
                $table->json('properties')->nullable();
                $table->uuid('batch_uuid')->nullable();
                $table->string('event')->nullable();
                $table->unsignedBigInteger('tenant_id')->nullable();
                $table->timestamps();
            });
        }
    }
}





