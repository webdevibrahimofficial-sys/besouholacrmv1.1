<?php

namespace Tests\Feature;

use App\Models\AiCopilotNotification;
use App\Models\Feature;
use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AiCopilot\CopilotNotificationPreviewBuilder;
use App\Services\TenantFeatureService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AiCopilotNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        config(['activitylog.enabled' => false, 'services.gemini.api_key' => '']);
        $this->ensureFeatureTables();
        $this->ensureCopilotTables();

        $this->tenant = Tenant::factory()->create([
            'name' => 'Copilot Tenant',
            'slug' => 'copilot-notif-tenant',
            'domain' => 'copilot-notif.localhost',
        ]);

        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'email' => 'copilot-notif@example.com',
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

    public function test_enqueue_dedupes_within_same_time_bucket(): void
    {
        $this->actingAsTenantUser();

        $lead = $this->createVisibleLead('Dedupe Lead');

        $first = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-intelligence', [
            'lead_id' => $lead->id,
            'source' => 'copilot:lead-opened',
        ]);

        $first->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.created', true)
            ->assertJsonPath('data.unread_count', 1);

        $notificationId = (int) $first->json('data.notification.id');

        $second = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-intelligence', [
            'lead_id' => $lead->id,
            'source' => 'copilot:lead-opened',
        ]);

        $second->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.created', false)
            ->assertJsonPath('data.notification.id', $notificationId)
            ->assertJsonPath('data.unread_count', 1);

        $this->assertSame(1, AiCopilotNotification::query()->count());
    }

    public function test_preview_is_deterministic_from_facts(): void
    {
        $this->actingAsTenantUser();

        $lead = $this->createVisibleLead('Preview Lead');

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-intelligence', [
            'lead_id' => $lead->id,
        ]);

        $response->assertOk()->assertJsonPath('data.ok', true);

        $payload = AiCopilotNotification::query()->firstOrFail()->payload;
        $expectedPreview = app(CopilotNotificationPreviewBuilder::class)->build($payload, 'en');

        $this->assertSame($expectedPreview, $response->json('data.notification.preview'));
    }

    public function test_enqueue_does_not_call_gemini(): void
    {
        Http::fake();

        $this->actingAsTenantUser();

        $lead = $this->createVisibleLead('No Gemini Lead');

        $this->postJson('/api/ai/copilot/notifications/enqueue-lead-intelligence', [
            'lead_id' => $lead->id,
        ])->assertOk()->assertJsonPath('data.ok', true);

        Http::assertNothingSent();
    }

    public function test_open_is_idempotent_and_reuses_conversation(): void
    {
        $this->actingAsTenantUser();

        $lead = $this->createVisibleLead('Open Lead');

        $enqueue = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-intelligence', [
            'lead_id' => $lead->id,
        ])->assertOk();

        $notificationId = (int) $enqueue->json('data.notification.id');

        $firstOpen = $this->postJson("/api/ai/copilot/notifications/{$notificationId}/open");
        $firstOpen->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.reopened', false)
            ->assertJsonPath('data.card.title', 'Lead Intelligence — Open Lead');

        $conversationId = (int) $firstOpen->json('data.conversation_id');
        $this->assertGreaterThan(0, $conversationId);

        $secondOpen = $this->postJson("/api/ai/copilot/notifications/{$notificationId}/open");
        $secondOpen->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.reopened', true)
            ->assertJsonPath('data.conversation_id', $conversationId)
            ->assertJsonPath('data.card.content', $firstOpen->json('data.card.content'));
    }

    public function test_out_of_scope_lead_returns_not_visible(): void
    {
        $this->user->update(['job_title' => 'Sales Person']);
        $this->user->refresh();
        $this->actingAsTenantUser();

        $otherUser = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'email' => 'other-agent@example.com',
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $otherUser->id,
            'created_by' => $otherUser->id,
            'name' => 'Hidden Lead',
        ]);

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-intelligence', [
            'lead_id' => $lead->id,
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('data.ok', false)
            ->assertJsonPath('data.reason', 'not_visible');

        $this->assertSame(0, AiCopilotNotification::query()->count());
    }

    public function test_list_and_unread_count_endpoints(): void
    {
        $this->actingAsTenantUser();

        $lead = $this->createVisibleLead('List Lead');

        $this->postJson('/api/ai/copilot/notifications/enqueue-lead-intelligence', [
            'lead_id' => $lead->id,
        ])->assertOk();

        $this->getJson('/api/ai/copilot/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 1);

        $this->getJson('/api/ai/copilot/notifications')
            ->assertOk()
            ->assertJsonPath('data.unread_count', 1)
            ->assertJsonCount(1, 'data.notifications');
    }

    public function test_rescue_enqueue_creates_notification_for_delayed_lead(): void
    {
        $this->actingAsTenantUser();

        $lead = $this->createDelayedLead('Rescue Lead');

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-rescue', [
            'lead_id' => $lead->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.created', true)
            ->assertJsonPath('data.notification.type', 'lead_rescue')
            ->assertJsonPath('data.notification.title', 'Lead Rescue — Rescue Lead');
    }

    public function test_rescue_and_intelligence_can_coexist_for_same_lead(): void
    {
        $this->actingAsTenantUser();

        $lead = $this->createDelayedLead('Dual Notify Lead');

        $this->postJson('/api/ai/copilot/notifications/enqueue-lead-intelligence', [
            'lead_id' => $lead->id,
        ])->assertOk()->assertJsonPath('data.created', true);

        $this->postJson('/api/ai/copilot/notifications/enqueue-lead-rescue', [
            'lead_id' => $lead->id,
        ])->assertOk()->assertJsonPath('data.created', true);

        $this->assertSame(2, AiCopilotNotification::query()->count());
    }

    public function test_scan_lead_rescue_enqueues_delayed_leads(): void
    {
        $this->actingAsTenantUser();

        $this->createDelayedLead('Scan Lead A');
        $this->createDelayedLead('Scan Lead B');

        $response = $this->postJson('/api/ai/copilot/notifications/scan-lead-rescue', [
            'limit' => 5,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.scanned', 2)
            ->assertJsonPath('data.created', 2);

        $this->assertSame(2, AiCopilotNotification::query()->where('type', 'lead_rescue')->count());
    }

    public function test_rescue_rejects_non_worthy_lead(): void
    {
        $this->actingAsTenantUser();

        $lead = $this->createVisibleLead('Healthy Lead');

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-rescue', [
            'lead_id' => $lead->id,
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('data.ok', false)
            ->assertJsonPath('data.reason', 'not_rescue_worthy');
    }

    public function test_unassigned_lead_suggests_assignee_for_manager(): void
    {
        $this->user->update(['job_title' => 'Sales Manager']);
        $this->actingAsTenantUser();

        $salesA = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Sales A',
            'job_title' => 'Sales Person',
            'manager_id' => $this->user->id,
        ]);
        $salesB = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Sales B',
            'job_title' => 'Sales Person',
            'manager_id' => $this->user->id,
        ]);

        Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $salesA->id,
            'created_by' => $this->user->id,
            'name' => 'Busy Lead',
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => null,
            'created_by' => $this->user->id,
            'name' => 'Unassigned Lead',
            'workflow_key' => 'sales',
        ]);

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-intelligence', [
            'lead_id' => $lead->id,
        ]);

        $response->assertOk()->assertJsonPath('data.ok', true);

        $payload = AiCopilotNotification::query()->firstOrFail()->payload;
        $assignment = $payload['facts']['assignment'] ?? [];
        $this->assertTrue($assignment['is_unassigned'] ?? false);
        $this->assertTrue($assignment['can_assign'] ?? false);
        $this->assertSame((int) $salesB->id, (int) ($assignment['suggested_assignee']['user_id'] ?? 0));

        $open = $this->postJson('/api/ai/copilot/notifications/'.AiCopilotNotification::query()->first()->id.'/open');
        $open->assertOk()
            ->assertJsonPath('data.card.ui_actions.0.action', 'assign_lead')
            ->assertJsonPath('data.card.ui_actions.0.payload.assigned_to', $salesB->id);
    }

    public function test_sales_person_gets_advice_without_assign_action(): void
    {
        $this->user->update(['job_title' => 'Sales Person']);
        $this->actingAsTenantUser();

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => null,
            'created_by' => $this->user->id,
            'name' => 'Unassigned Sales View',
            'workflow_key' => 'sales',
        ]);

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-intelligence', [
            'lead_id' => $lead->id,
        ]);

        $response->assertOk();

        $payload = AiCopilotNotification::query()->firstOrFail()->payload;
        $assignment = $payload['facts']['assignment'] ?? [];
        $this->assertTrue($assignment['is_unassigned'] ?? false);
        $this->assertFalse($assignment['can_assign'] ?? true);

        $open = $this->postJson('/api/ai/copilot/notifications/'.AiCopilotNotification::query()->first()->id.'/open');
        $actions = $open->json('data.card.ui_actions') ?? [];
        $assignActions = array_values(array_filter($actions, fn ($action) => ($action['action'] ?? null) === 'assign_lead'));
        $this->assertSame([], $assignActions);
    }

    public function test_escalation_enqueue_for_manager_with_stalled_team_lead(): void
    {
        $this->user->update(['job_title' => 'Sales Manager']);
        $this->actingAsTenantUser();

        $sales = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Stalled Sales',
            'job_title' => 'Sales Person',
            'manager_id' => $this->user->id,
        ]);

        $lead = $this->createDelayedLeadForAssignee('Escalation Lead', $sales->id, 30);

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-escalation', [
            'lead_id' => $lead->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.created', true)
            ->assertJsonPath('data.notification.type', 'escalation')
            ->assertJsonPath('data.notification.title', 'Manager Escalation — Escalation Lead');

        $payload = AiCopilotNotification::query()->firstOrFail()->payload;
        $this->assertSame('Stalled Sales', $payload['facts']['escalation']['assigned_user_name'] ?? null);
    }

    public function test_escalation_rejects_sales_person_audience(): void
    {
        $this->user->update(['job_title' => 'Sales Person']);
        $this->actingAsTenantUser();

        $lead = $this->createDelayedLead('Sales Escalation Lead');

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-escalation', [
            'lead_id' => $lead->id,
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('data.ok', false)
            ->assertJsonPath('data.reason', 'not_escalation_audience');
    }

    public function test_scan_lead_escalation_for_manager_team(): void
    {
        $this->user->update(['job_title' => 'Sales Manager']);
        $this->actingAsTenantUser();

        $salesA = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'job_title' => 'Sales Person',
            'manager_id' => $this->user->id,
        ]);
        $salesB = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'job_title' => 'Sales Person',
            'manager_id' => $this->user->id,
        ]);

        $this->createDelayedLeadForAssignee('Escalation Scan A', $salesA->id, 30);
        $this->createDelayedLeadForAssignee('Escalation Scan B', $salesB->id, 36);

        $response = $this->postJson('/api/ai/copilot/notifications/scan-lead-escalation', [
            'limit' => 5,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.scanned', 2)
            ->assertJsonPath('data.created', 2);

        $this->assertSame(2, AiCopilotNotification::query()->where('type', 'escalation')->count());
    }

    public function test_lost_detective_enqueue_for_lost_lead(): void
    {
        $this->actingAsTenantUser();

        $lead = $this->createLostLead('Lost Detective Lead', 'Price too high');

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-lost-detective', [
            'lead_id' => $lead->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.created', true)
            ->assertJsonPath('data.notification.type', 'lost_detective')
            ->assertJsonPath('data.notification.title', 'Lost Lead Detective — Lost Detective Lead');

        $payload = AiCopilotNotification::query()->firstOrFail()->payload;
        $this->assertSame('price_objection', $payload['facts']['detective']['hypothesis_code'] ?? null);
        $this->assertArrayHasKey('can_clone', $payload['facts']['clone'] ?? []);
    }

    public function test_lost_detective_clone_action_suggests_different_assignee(): void
    {
        $this->user->update(['job_title' => 'Sales Manager']);
        $this->actingAsTenantUser();

        $salesA = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Lost Sales A',
            'job_title' => 'Sales Person',
            'manager_id' => $this->user->id,
        ]);
        $salesB = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Fresh Sales B',
            'job_title' => 'Sales Person',
            'manager_id' => $this->user->id,
        ]);

        Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $salesA->id,
            'created_by' => $this->user->id,
            'name' => 'Busy Lead',
        ]);

        $lead = $this->createLostLead('Clone Candidate Lead', 'Price too high');
        $lead->update(['assigned_to' => $salesA->id]);

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-lost-detective', [
            'lead_id' => $lead->id,
        ]);

        $response->assertOk()->assertJsonPath('data.ok', true);

        $payload = AiCopilotNotification::query()->firstOrFail()->payload;
        $clone = $payload['facts']['clone'] ?? [];
        $this->assertTrue($clone['can_clone'] ?? false);
        $this->assertSame((int) $salesB->id, (int) ($clone['suggested_assignee']['user_id'] ?? 0));

        $open = $this->postJson('/api/ai/copilot/notifications/'.AiCopilotNotification::query()->first()->id.'/open');
        $open->assertOk();

        $actions = collect($open->json('data.card.ui_actions') ?? []);
        $cloneAction = $actions->first(fn ($action) => ($action['action'] ?? null) === 'clone_lead');
        $this->assertNotNull($cloneAction);
        $this->assertTrue($cloneAction['payload']['duplicate'] ?? false);
        $this->assertSame((int) $salesB->id, (int) ($cloneAction['payload']['suggested_user_id'] ?? 0));
    }

    public function test_lost_detective_hides_clone_action_for_sales_person(): void
    {
        $this->user->update(['job_title' => 'Sales Person']);
        $this->actingAsTenantUser();

        $lead = $this->createLostLead('Sales View Lost Lead', 'Price too high');

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-lost-detective', [
            'lead_id' => $lead->id,
        ]);

        $response->assertOk()->assertJsonPath('data.ok', true);

        $payload = AiCopilotNotification::query()->firstOrFail()->payload;
        $this->assertFalse($payload['facts']['clone']['can_clone'] ?? true);

        $open = $this->postJson('/api/ai/copilot/notifications/'.AiCopilotNotification::query()->first()->id.'/open');
        $actions = collect($open->json('data.card.ui_actions') ?? []);
        $cloneAction = $actions->first(fn ($action) => ($action['action'] ?? null) === 'clone_lead');
        $this->assertNull($cloneAction);
    }

    public function test_lost_detective_rejects_active_lead(): void
    {
        $this->actingAsTenantUser();

        $lead = $this->createVisibleLead('Active Lead');

        $response = $this->postJson('/api/ai/copilot/notifications/enqueue-lead-lost-detective', [
            'lead_id' => $lead->id,
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('data.ok', false)
            ->assertJsonPath('data.reason', 'not_lost_lead');
    }

    public function test_scan_lost_detective_finds_recent_lost_leads(): void
    {
        $this->actingAsTenantUser();

        $this->createLostLead('Scan Lost A');
        $this->createLostLead('Scan Lost B');

        $response = $this->postJson('/api/ai/copilot/notifications/scan-lead-lost-detective', [
            'limit' => 5,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.scanned', 2)
            ->assertJsonPath('data.created', 2);

        $this->assertSame(2, AiCopilotNotification::query()->where('type', 'lost_detective')->count());
    }

    protected function createLostLead(string $name, ?string $cancelReason = null): Lead
    {
        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'created_by' => $this->user->id,
            'name' => $name,
            'stage' => 'Canceled',
            'status' => 'Lost',
            'source' => 'Website',
            'workflow_key' => 'sales',
            'updated_at' => now(),
        ]);

        LeadAction::create([
            'lead_id' => $lead->id,
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'action_type' => 'call',
            'description' => 'Proposal follow up',
            'details' => [
                'outcome' => 'no_answer',
            ],
            'created_at' => now()->subHours(72),
            'updated_at' => now()->subHours(72),
        ]);

        LeadAction::create([
            'lead_id' => $lead->id,
            'tenant_id' => $this->tenant->id,
            'user_id' => $this->user->id,
            'action_type' => 'cancel',
            'description' => 'Lead canceled',
            'details' => [
                'cancel_reason' => $cancelReason ?? 'Client chose competitor',
            ],
        ]);

        return $lead;
    }

    protected function createDelayedLeadForAssignee(string $name, int $assigneeId, int $contactHoursAgo = 30): Lead
    {
        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $assigneeId,
            'created_by' => $this->user->id,
            'name' => $name,
            'workflow_key' => 'sales',
        ]);

        $action = LeadAction::create([
            'lead_id' => $lead->id,
            'tenant_id' => $this->tenant->id,
            'user_id' => $assigneeId,
            'action_type' => 'call',
            'description' => 'Delayed follow up',
            'details' => [
                'status' => 'scheduled',
                'date' => now()->subDays(2)->format('Y-m-d'),
                'time' => '10:00',
            ],
        ]);

        $action->created_at = now()->subHours($contactHoursAgo);
        $action->updated_at = now()->subHours($contactHoursAgo);
        $action->save();

        return $lead;
    }

    protected function createDelayedLead(string $name): Lead
    {
        return $this->createDelayedLeadForAssignee($name, (int) $this->user->id, 30);
    }

    protected function createVisibleLead(string $name): Lead
    {
        return Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'created_by' => $this->user->id,
            'name' => $name,
        ]);
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

        if (! Schema::hasTable('ai_copilot_notifications')) {
            Schema::create('ai_copilot_notifications', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tenant_id')->index();
                $table->unsignedBigInteger('user_id')->index();
                $table->string('type', 64);
                $table->unsignedBigInteger('lead_id');
                $table->string('time_bucket', 32);
                $table->string('severity', 16)->default('info');
                $table->string('title');
                $table->text('preview');
                $table->json('payload');
                $table->unsignedBigInteger('conversation_id')->nullable()->index();
                $table->timestamp('read_at')->nullable();
                $table->timestamp('dismissed_at')->nullable();
                $table->timestamp('first_opened_at')->nullable();
                $table->timestamps();

                $table->unique(
                    ['tenant_id', 'user_id', 'type', 'lead_id', 'time_bucket'],
                    'ai_copilot_notifications_dedupe_unique'
                );
            });
        }
    }
}
