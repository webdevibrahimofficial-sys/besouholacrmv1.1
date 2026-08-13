<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureTenantHasFeature;
use App\Models\Feature;
use App\Models\Lead;
use App\Models\Stage;
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
                    'Control' => [
                        'showReports',
                    ],
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

    public function test_chat_lists_reports_without_module_overview(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'What reports can I open?',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'list_reports');

        $message = (string) $response->json('data.message');
        $this->assertStringContainsString('reports available', $message);
        $this->assertStringNotContainsString('• Leads Pipeline', $message);
        $this->assertStringNotContainsString('Modules:', $message);
        $this->assertSame('Open Leads Pipeline', $response->json('data.ui_actions.0.label'));
        $this->assertSame('reports', $response->json('data.ui_actions.0.group'));
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

    public function test_catalog_guesses_arabic_report_aliases(): void
    {
        $catalog = app(\App\Services\AiCopilot\AiSystemCatalog::class);

        $this->assertSame('meetings', $catalog->guessReportKey('افتح تقرير الميتنج'));
        $this->assertSame('leads_pipeline', $catalog->guessReportKey('تقرير البايبلاين'));
        $this->assertSame('sales_to_telesales', $catalog->guessReportKey('to telesales'));
        $this->assertSame('sales_to_telesales', $catalog->guessReportKey('sales_to_telesales_transfers'));
        $this->assertSame('sales_to_telesales', $catalog->guessReportKey('تيليسيلز'));
        $this->assertNotNull($catalog->findReport('sales_to_telesales'));
    }

    public function test_chat_service_guesses_relative_date_ranges(): void
    {
        $service = app(\App\Services\AiCopilot\AiCopilotChatService::class);
        $method = new \ReflectionMethod($service, 'guessDates');
        $method->setAccessible(true);

        $today = now()->toDateString();
        $thisWeekStart = now()->subDays(6)->toDateString();
        $monthStart = now()->startOfMonth()->toDateString();

        $this->assertSame(
            ['date_from' => $today, 'date_to' => $today],
            $method->invoke($service, 'افتح التقرير اليوم')
        );

        $this->assertSame(
            ['date_from' => $thisWeekStart, 'date_to' => $today],
            $method->invoke($service, 'pipeline last 7 days')
        );

        $this->assertSame(
            ['date_from' => $monthStart, 'date_to' => $today],
            $method->invoke($service, 'تقرير هذا الشهر')
        );

        $this->assertSame(
            ['date_from' => '2026-01-01', 'date_to' => '2026-01-31'],
            $method->invoke($service, 'من 2026-01-01 إلى 2026-01-31')
        );
    }

    public function test_catalog_modules_are_permission_aware(): void
    {
        $catalog = app(\App\Services\AiCopilot\AiSystemCatalog::class);
        $user = $this->user->fresh();

        $forUser = $catalog->forUser($user);
        $moduleKeys = collect($forUser['modules'] ?? [])->pluck('key')->all();

        $this->assertContains('tasks', $moduleKeys);
        $this->assertNotContains('settings', $moduleKeys);
        $this->assertNotContains('marketing_meta', $moduleKeys);
        $this->assertSame('leads', $catalog->guessModuleKey('اشرح الليدز'));
        $this->assertTrue($catalog->isSystemOverviewTopic('اشرح السيستم'));
    }

    public function test_explain_system_returns_only_visible_modules(): void
    {
        $executor = app(AiCopilotToolExecutor::class);
        $result = $executor->execute($this->user->fresh(), 'explain_feature', [
            'topic' => 'system',
        ]);

        $this->assertTrue($result['ok']);
        $moduleKeys = collect($result['modules'] ?? [])->pluck('key')->all();
        $this->assertContains('tasks', $moduleKeys);
        $this->assertNotContains('settings', $moduleKeys);
        $this->assertNotEmpty($result['ui_actions'] ?? []);
        $this->assertSame('navigate', $result['ui_actions'][0]['type'] ?? null);
    }

    public function test_chat_explain_system_uses_explain_feature(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'اشرح لي السيستم',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'explain_feature')
            ->assertJsonPath('data.locale', 'ar');
        $this->assertNotEmpty($response->json('data.message'));
        $this->assertNotEmpty($response->json('data.ui_actions'));
        $this->assertStringContainsString('تقدر', (string) $response->json('data.message'));
    }

    public function test_chat_english_message_replies_in_english(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'Explain the system',
            'locale' => 'en',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'explain_feature')
            ->assertJsonPath('data.locale', 'en');
        $this->assertStringContainsString('access', (string) $response->json('data.message'));
    }

    public function test_chat_explains_arabic_whatsapp_integration_from_backend(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'ازاي اربط واتساب في السيستم؟',
            'locale' => 'ar',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'integration_guide')
            ->assertJsonPath('data.integration_guide.type', 'whatsapp')
            ->assertJsonPath('data.locale', 'ar')
            ->assertJsonPath('data.ui_actions.0.path', '/settings/integrations/whatsapp');

        $message = (string) $response->json('data.message');
        $this->assertStringContainsString('شرح ربط WhatsApp Business', $message);
        $this->assertStringContainsString('Webhook URL', $message);
    }

    public function test_chat_explains_website_integration_from_backend(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'Explain website integration setup',
            'locale' => 'en',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'integration_guide')
            ->assertJsonPath('data.integration_guide.type', 'website')
            ->assertJsonPath('data.locale', 'en');

        $this->assertStringContainsString('Allowed Origins', (string) $response->json('data.message'));
    }

    public function test_chat_asks_which_integration_when_type_is_missing(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'اشرحلي ربط الانتجريشن',
            'locale' => 'ar',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'integration_guide')
            ->assertJsonPath('data.integration_guide.type', 'chooser');

        $this->assertCount(3, $response->json('data.ui_actions'));
    }

    public function test_chat_explains_tenant_custom_meta_app_setup(): void
    {
        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'اشرح ربط Meta بالتطبيق الخاص بالتينانت',
            'locale' => 'ar',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'integration_guide')
            ->assertJsonPath('data.integration_guide.type', 'meta')
            ->assertJsonPath('data.ui_actions.0.path', '/marketing/meta-integration');

        $message = (string) $response->json('data.message');
        $this->assertStringContainsString('Custom App', $message);
        $this->assertStringContainsString('/api/meta/webhook/{webhook_key}', $message);
        $this->assertStringContainsString('/api/auth/meta/callback', $message);
        $this->assertStringContainsString('Shared App', $message);
    }

    public function test_confirm_create_task_success_returns_open_lead_and_open_task_actions(): void
    {
        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->user->id,
            'manager_id' => $this->user->id,
        ]);

        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/actions/confirm', [
            'action' => 'create_task_for_lead',
            'payload' => [
                'lead_id' => $lead->id,
                'title' => 'Follow up',
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.ui_actions.0.label', 'Open lead')
            ->assertJsonPath('data.ui_actions.1.label', 'Open task')
            ->assertJsonPath('data.ui_actions.2.label', 'Open tasks');
    }

    public function test_chat_resolves_arabic_employee_and_stage_filters_for_reports(): void
    {
        $employee = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'أحمد سامي',
            'manager_id' => $this->user->id,
        ]);

        Stage::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Meeting',
            'name_ar' => 'اجتماع',
            'type' => 'meeting',
            'workflow_key' => 'sales',
            'is_active' => true,
        ]);

        $this->actingAsTenantUser();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'افتح تقرير pipeline من 2026-07-01 إلى 2026-07-31 للموظف أحمد سامي مرحلة اجتماع',
            'locale' => 'ar',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'navigate_report');

        $path = (string) $response->json('data.ui_actions.0.path');
        $this->assertStringContainsString('assigned_to='.$employee->id, $path);
        $this->assertStringContainsString('stage=Meeting', $path);
        $this->assertStringContainsString('created_from=2026-07-01', $path);
        $this->assertStringContainsString('created_to=2026-07-31', $path);
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
            ->assertJsonPath('data.ok', false)
            ->assertJsonPath('data.resource', 'task')
            ->assertJsonPath('data.requires_confirmation', false);
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
