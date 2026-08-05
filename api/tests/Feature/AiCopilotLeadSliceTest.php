<?php

namespace Tests\Feature;

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
            ->assertJsonPath('data.tool_result.missing_fields.1', 'item');
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
            ->assertJsonPath('data.tool_result.message', 'Selected source does not exist for this tenant.');
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
