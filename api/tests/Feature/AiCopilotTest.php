<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureTenantHasFeature;
use App\Models\Feature;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AiCopilot\AiCopilotToolExecutor;
use App\Services\TenantFeatureService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AiCopilotTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $user;
    protected Feature $feature;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
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
            'meta_data' => [
                'module_permissions' => [
                    'Reports' => [
                        'Leads Pipeline_show',
                        'Leads Pipeline_export',
                    ],
                ],
            ],
        ]);

        $this->feature = Feature::firstOrCreate([
            'key' => 'besouhola_copilot',
        ], [
            'name' => 'Besouhola Copilot',
            'description' => 'AI copilot',
            'is_active' => true,
        ]);

        app(TenantFeatureService::class)->enableFeature($this->tenant, 'besouhola_copilot');
    }

    public function test_chat_requires_non_empty_message(): void
    {
        $this->actingAsTenantUser();

        $this->postJson('/api/ai/copilot/chat', ['message' => ''])
            ->assertStatus(422);
    }

    public function test_chat_blocked_when_feature_disabled(): void
    {
        app(TenantFeatureService::class)->disableFeature($this->tenant, 'besouhola_copilot');
        Cache::flush();

        $this->actingAsTenantUser();

        $this->postJson('/api/ai/copilot/chat', ['message' => 'help'])
            ->assertStatus(403)
            ->assertJsonPath('feature', 'besouhola_copilot');
    }

    public function test_chat_lists_capabilities(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'what can you do',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'list_capabilities');

        $this->assertNotEmpty($response->json('data.message'));
    }

    public function test_navigate_report_denied_without_permission(): void
    {
        $this->user->forceFill([
            'meta_data' => [
                'module_permissions' => [
                    'Reports' => [],
                ],
            ],
        ])->save();

        $executor = app(AiCopilotToolExecutor::class);
        $result = $executor->execute($this->user->fresh(), 'navigate_report', [
            'report' => 'leads_pipeline',
        ]);

        $this->assertFalse($result['ok']);
        $this->assertStringContainsString('permission', strtolower($result['message']));
    }

    public function test_export_report_allowed_with_permission(): void
    {
        $executor = app(AiCopilotToolExecutor::class);
        $result = $executor->execute($this->user->fresh(), 'export_report', [
            'report' => 'pipeline',
            'date_from' => '2026-08-01',
            'date_to' => '2026-08-03',
        ]);

        $this->assertTrue($result['ok']);
        $this->assertNotEmpty($result['ui_actions'] ?? []);
        $this->assertSame('download', $result['ui_actions'][0]['type'] ?? null);
    }

    public function test_confirm_create_task_denied_for_invisible_lead(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/actions/confirm', [
            'action' => 'create_task_for_lead',
            'payload' => [
                'lead_id' => 999999,
                'title' => 'Follow up',
            ],
        ]);

        $response->assertStatus(403)
            ->assertJsonPath('data.ok', false);
    }

    public function test_status_endpoint_requires_feature(): void
    {
        $request = Request::create('/api/ai/copilot/status', 'GET');
        $request->setUserResolver(fn () => $this->user);

        app()->instance('tenant', $this->tenant);
        app()->instance('current_tenant_id', $this->tenant->id);

        app(TenantFeatureService::class)->disableFeature($this->tenant, 'besouhola_copilot');
        Cache::flush();

        $middleware = app(EnsureTenantHasFeature::class);
        $response = $middleware->handle($request, fn () => response()->json(['ok' => true]), 'besouhola_copilot');

        $this->assertSame(403, $response->getStatusCode());
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

        if (! Schema::hasTable('exports')) {
            Schema::create('exports', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tenant_id')->nullable();
                $table->unsignedBigInteger('user_id')->nullable();
                $table->string('module')->nullable();
                $table->string('action')->nullable();
                $table->string('file_name')->nullable();
                $table->string('format')->nullable();
                $table->string('status')->nullable();
                $table->text('filters')->nullable();
                $table->json('meta_data')->nullable();
                $table->text('error_message')->nullable();
                $table->timestamps();
            });
        }
    }
}
