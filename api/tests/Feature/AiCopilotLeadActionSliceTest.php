<?php

namespace Tests\Feature;

use App\Models\Feature;
use App\Models\Lead;
use App\Models\LeadAction;
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

class AiCopilotLeadActionSliceTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        config(['activitylog.enabled' => false]);
        $this->ensureFeatureTables();
        $this->ensureCopilotTables();

        $this->tenant = Tenant::factory()->create([
            'name' => 'Copilot Tenant',
            'slug' => 'copilot-tenant',
            'domain' => 'copilot-tenant.localhost',
        ]);

        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'email' => 'copilot-user@example.com',
        ]);

        Feature::firstOrCreate([
            'key' => 'besouhola_copilot',
        ], [
            'name' => 'Besouhola Copilot',
            'description' => 'AI copilot',
            'is_active' => true,
        ]);

        app(TenantFeatureService::class)->enableFeature($this->tenant, 'besouhola_copilot');
    }

    public function test_chat_can_draft_lead_action(): void
    {
        $this->actingAsTenantUser();

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'created_by' => $this->user->id,
            'name' => 'Draft Lead',
        ]);

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'create follow up action for lead '.$lead->id.' tomorrow',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'create_lead_action_draft')
            ->assertJsonPath('data.tool_result.state', 'awaiting_details')
            ->assertJsonPath('data.tool_result.resource', 'lead_action')
            ->assertJsonPath('data.tool_result.missing_fields.0', 'details_text');
    }

    public function test_generic_action_request_asks_for_action_type_before_stage(): void
    {
        $this->actingAsTenantUser();

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'created_by' => $this->user->id,
            'name' => 'Generic Lead',
        ]);

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'start an action on lead '.$lead->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'create_lead_action_draft')
            ->assertJsonPath('data.tool_result.state', 'awaiting_action_type')
            ->assertJsonPath('data.tool_result.resource', 'lead_action')
            ->assertJsonPath('data.ui_actions.0.label', 'Call')
            ->assertJsonPath('data.ui_actions.1.label', 'WhatsApp');
    }

    public function test_action_type_selection_asks_for_details_before_stage(): void
    {
        $this->actingAsTenantUser();

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'created_by' => $this->user->id,
            'name' => 'test2',
        ]);

        $start = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'start an action',
        ]);

        $start->assertOk()
            ->assertJsonPath('data.tool_result.state', 'needs_input');

        $conversationId = (int) $start->json('data.conversation_id');

        $leadReply = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => 'test2',
        ]);

        $leadReply->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_action_type')
            ->assertJsonPath('data.tool_result.payload.lead_id', $lead->id);

        $typeSelection = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => '__copilot_action_type__:call',
        ]);

        $typeSelection->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_details')
            ->assertJsonPath('data.tool_result.missing_fields.0', 'details_text')
            ->assertJsonPath('data.tool_result.payload.type', 'call');

        $this->assertStringContainsString('call', strtolower((string) $typeSelection->json('data.tool_result.message')));
    }


    public function test_arabic_action_request_from_chat_ui_is_recognized(): void
    {
        $this->actingAsTenantUser();

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'created_by' => $this->user->id,
            'name' => 'Arabic Lead',
        ]);

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => json_decode('"\u0627\u0628\u062f\u0623 \u0623\u0643\u0634\u0646 \u0639\u0644\u0649 \u0627\u0644\u0644\u064a\u062f "', true).$lead->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'create_lead_action_draft')
            ->assertJsonPath('data.tool_result.state', 'awaiting_action_type')
            ->assertJsonPath('data.tool_result.payload.lead_id', $lead->id);
    }

    public function test_confirm_can_create_lead_action_via_existing_flow(): void
    {
        $this->actingAsTenantUser();

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'created_by' => $this->user->id,
            'name' => 'Action Lead',
            'status' => 'new',
        ]);

        $response = $this->postJson('/api/ai/copilot/actions/confirm', [
            'action' => 'create_lead_action',
            'payload' => [
                'lead_id' => $lead->id,
                'type' => 'follow_up',
                'status' => 'scheduled',
                'date' => '2026-08-05',
                'description' => 'Copilot follow up',
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.state', 'completed')
            ->assertJsonPath('data.resource', 'lead_action')
            ->assertJsonPath('data.requires_confirmation', false);

        $this->assertDatabaseHas('lead_actions', [
            'lead_id' => $lead->id,
            'user_id' => $this->user->id,
            'action_type' => 'follow_up',
        ]);

        $this->assertSame(1, LeadAction::query()->where('lead_id', $lead->id)->count());
    }


    public function test_arabic_action_wizard_can_go_from_start_to_confirm_and_create(): void
    {
        $this->actingAsTenantUser();

        $followUpStageId = DB::table('stages')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Follow Up',
            'name_ar' => json_decode('"\u0645\u062a\u0627\u0628\u0639\u0629"', true),
            'type' => 'follow_up',
            'workflow_key' => 'sales',
            'is_active' => true,
            'order' => 2,
            'color' => '#10B981',
            'icon' => 'PhoneCall',
            'meta_data' => json_encode([]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'created_by' => $this->user->id,
            'name' => json_decode('"\u0645\u062d\u0645\u0648\u062f"', true),
            'workflow_key' => 'sales',
            'status' => 'new',
        ]);

        $start = $this->postJson('/api/ai/copilot/chat', [
            'message' => json_decode('"\u0627\u0628\u062f\u0623 \u0623\u0643\u0634\u0646 \u0639\u0644\u0649 \u0627\u0644\u0644\u064a\u062f "', true).$lead->id,
        ]);

        $start->assertOk()
            ->assertJsonPath('data.tool', 'create_lead_action_draft')
            ->assertJsonPath('data.tool_result.state', 'awaiting_action_type')
            ->assertJsonPath('data.tool_result.resource', 'lead_action');

        $conversationId = (int) $start->json('data.conversation_id');

        $typeSelection = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => '__copilot_action_type__:call',
        ]);

        $typeSelection->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_details')
            ->assertJsonPath('data.tool_result.resource', 'lead_action')
            ->assertJsonPath('data.tool_result.payload.type', 'call');

        $details = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => json_decode('"\u0627\u062a\u0635\u0644\u062a \u0628\u0627\u0644\u0639\u0645\u064a\u0644 \u0648\u0631\u062f\u060c \u0645\u0647\u062a\u0645 \u0648\u0637\u0644\u0628 \u0645\u062a\u0627\u0628\u0639\u0629"', true),
        ]);

        $details->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_stage')
            ->assertJsonPath('data.tool_result.resource', 'lead_action');

        $stageSelection = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => '__copilot_action_stage__:'.$followUpStageId,
        ]);

        $stageSelection->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_schedule')
            ->assertJsonPath('data.tool_result.payload.lead_id', $lead->id)
            ->assertJsonPath('data.ui_actions.0.type', 'form')
            ->assertJsonPath('data.ui_actions.0.fields.0.type', 'date')
            ->assertJsonPath('data.ui_actions.0.fields.1.type', 'time');

        $schedule = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => "موعد المتابعة\ndate: 2026-08-20\ntime: 18:30",
        ]);

        $schedule->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_confirmation')
            ->assertJsonPath('data.tool_result.requires_confirmation', true)
            ->assertJsonPath('data.ui_actions.0.action', 'create_lead_action')
            ->assertJsonPath('data.tool_result.payload.lead_id', $lead->id)
            ->assertJsonPath('data.tool_result.payload.date', '2026-08-20')
            ->assertJsonPath('data.tool_result.payload.time', '18:30')
            ->assertJsonPath('data.tool_result.payload.outcome', 'answer')
            ->assertJsonPath('data.ui_actions.0.payload.answerStatus', 'answer');

        $confirmPayload = $schedule->json('data.ui_actions.0.payload');
        $this->assertIsArray($confirmPayload);

        $confirm = $this->postJson('/api/ai/copilot/actions/confirm', [
            'action' => 'create_lead_action',
            'payload' => $confirmPayload,
        ]);

        $confirm->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.state', 'completed')
            ->assertJsonPath('data.resource', 'lead_action');

        $this->assertDatabaseHas('lead_actions', [
            'lead_id' => $lead->id,
            'user_id' => $this->user->id,
            'action_type' => 'call',
        ]);

        $created = LeadAction::query()->where('lead_id', $lead->id)->latest('id')->first();
        $this->assertNotNull($created);
        $details = is_array($created->details) ? $created->details : [];
        $this->assertSame('answer', $details['answerStatus'] ?? null);
        $this->assertSame('answer', $details['outcome'] ?? null);

        $this->assertSame(1, LeadAction::query()->where('lead_id', $lead->id)->count());
    }

    public function test_copilot_persists_no_answer_status_on_created_action(): void
    {
        $this->actingAsTenantUser();

        $followUpStageId = DB::table('stages')->insertGetId([
            'tenant_id' => $this->tenant->id,
            'name' => 'Follow Up',
            'name_ar' => 'متابعة',
            'type' => 'follow_up',
            'workflow_key' => 'sales',
            'is_active' => true,
            'order' => 2,
            'color' => '#10B981',
            'icon' => 'PhoneCall',
            'meta_data' => json_encode([]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'created_by' => $this->user->id,
            'name' => 'test2',
            'workflow_key' => 'sales',
            'status' => 'new',
        ]);

        $start = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'start an action on lead '.$lead->id,
        ]);
        $conversationId = (int) $start->json('data.conversation_id');

        $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => '__copilot_action_type__:call',
        ])->assertOk()->assertJsonPath('data.tool_result.state', 'awaiting_details');

        $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => 'كلمته مردش عليا',
        ])->assertOk()->assertJsonPath('data.tool_result.state', 'awaiting_stage');

        $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => '__copilot_action_stage__:'.$followUpStageId,
        ])->assertOk()->assertJsonPath('data.tool_result.state', 'awaiting_schedule');

        $schedule = $this->postJson('/api/ai/copilot/chat', [
            'conversation_id' => $conversationId,
            'message' => "Next action schedule\ndate: 2026-08-13\ntime: 16:00",
        ]);

        $schedule->assertOk()
            ->assertJsonPath('data.tool_result.state', 'awaiting_confirmation')
            ->assertJsonPath('data.tool_result.payload.outcome', 'no_answer')
            ->assertJsonPath('data.ui_actions.0.payload.answerStatus', 'no_answer');

        $confirm = $this->postJson('/api/ai/copilot/actions/confirm', [
            'action' => 'create_lead_action',
            'payload' => $schedule->json('data.ui_actions.0.payload'),
        ]);

        $confirm->assertOk()->assertJsonPath('data.ok', true);

        $created = LeadAction::query()->where('lead_id', $lead->id)->latest('id')->first();
        $this->assertNotNull($created);
        $details = is_array($created->details) ? $created->details : [];
        $this->assertSame('no_answer', $details['answerStatus'] ?? null);
        $this->assertSame('no_answer', $details['outcome'] ?? null);

        $confirm->assertJsonPath('data.ui_actions.0.type', 'navigate')
            ->assertJsonPath('data.ui_actions.0.search', '?lead_id='.$lead->id.'&tab=all-actions');
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
}

