<?php

namespace Tests\Feature;

use App\Http\Resources\FinancialEvaluationResource;
use App\Models\Feature;
use App\Models\FinancialEvaluation;
use App\Models\FinancialPolicyVersion;
use App\Models\Lead;
use App\Models\Property;
use App\Models\Tenant;
use App\Models\User;
use App\Services\AiCopilot\AiCopilotChatService;
use App\Services\AiCopilot\CopilotFinancialDecisionGate;
use App\Services\FinancialDecision\Adapters\RealEstateAdapter;
use App\Services\FinancialDecision\FinancialRequestParser;
use App\Services\TenantFeatureService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FinancialDecisionTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected User $admin;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();
        config([
            'activitylog.enabled' => false,
            'services.gemini.api_key' => '',
        ]);
        $this->ensureFeatureTables();
        $this->ensureCopilotTables();

        $this->tenant = Tenant::factory()->create([
            'name' => 'Financial Tenant',
            'slug' => 'financial-tenant',
            'domain' => 'financial-tenant.localhost',
        ]);

        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'email' => 'financial-admin@example.com',
            'job_title' => 'Admin',
        ]);

        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'email' => 'financial-user@example.com',
            'job_title' => 'Sales Person',
        ]);

        Feature::firstOrCreate([
            'key' => 'besouhola_copilot',
        ], [
            'name' => 'Besouhola Copilot',
            'description' => 'AI copilot',
            'is_active' => true,
        ]);

        Feature::firstOrCreate([
            'key' => 'financial_decision_engine',
        ], [
            'name' => 'Financial Decision Engine',
            'description' => 'NPV policy engine',
            'is_active' => true,
        ]);

        app(TenantFeatureService::class)->enableFeature($this->tenant, 'besouhola_copilot');
        app(TenantFeatureService::class)->enableFeature($this->tenant, 'financial_decision_engine');
    }

    public function test_chat_service_is_bound_to_gate_without_chat_service_injection(): void
    {
        $bound = app(AiCopilotChatService::class);
        $this->assertInstanceOf(CopilotFinancialDecisionGate::class, $bound);

        $params = (new \ReflectionMethod(CopilotFinancialDecisionGate::class, '__construct'))->getParameters();
        foreach ($params as $param) {
            $type = $param->getType();
            $name = $type instanceof \ReflectionNamedType ? $type->getName() : '';
            $this->assertNotSame(AiCopilotChatService::class, $name);
        }
    }

    public function test_unconfigured_discount_rate_returns_incomplete(): void
    {
        $this->actingAsTenantUser($this->admin);

        $settings = $this->getJson('/api/financial-decision/settings');
        $settings->assertOk()
            ->assertJsonPath('data.assumptions.discount_rate', null)
            ->assertJsonPath('data.assumptions.is_explicitly_configured', false);

        $response = $this->postJson('/api/ai/copilot/financial/evaluate', $this->offerPayload());

        $response->assertOk()
            ->assertJsonPath('data.decision', 'incomplete')
            ->assertJsonPath('data.reasons.0', 'financial_assumptions_missing');
        $this->assertStringNotContainsString('calculation_trace', (string) $response->getContent());
    }

    public function test_put_settings_creates_immutable_policy_version(): void
    {
        $this->actingAsTenantUser($this->admin);

        $first = $this->putJson('/api/financial-decision/settings', $this->settingsPayload('0.1200', '0.80'));
        $first->assertOk()
            ->assertJsonPath('data.assumptions.discount_rate', '0.1200')
            ->assertJsonPath('data.assumptions.is_explicitly_configured', true);

        $version = FinancialPolicyVersion::query()->first();
        $this->assertNotNull($version);
        $original = $version->thresholds;

        $second = $this->putJson('/api/financial-decision/settings', $this->settingsPayload('0.1000', '0.75'));
        $second->assertOk()
            ->assertJsonPath('data.assumptions.discount_rate', '0.1000')
            ->assertJsonPath('data.policy.minimum_npv_ratio', '0.75');

        $this->assertSame(2, FinancialPolicyVersion::query()->count());
        $this->assertSame($original, $version->fresh()->thresholds);
        $this->assertNotSame($version->id, FinancialPolicyVersion::query()->orderByDesc('id')->value('id'));
        $this->assertStringNotContainsString('calculation_trace', (string) $second->getContent());
    }

    public function test_non_admin_cannot_update_settings(): void
    {
        $this->actingAsTenantUser($this->user);

        $this->putJson('/api/financial-decision/settings', $this->settingsPayload())
            ->assertStatus(403);
        $this->getJson('/api/financial-decision/settings')
            ->assertStatus(403);
    }

    public function test_evaluate_response_omits_calculation_trace_even_when_stored(): void
    {
        $this->actingAsTenantUser($this->admin);
        $this->putJson('/api/financial-decision/settings', $this->settingsPayload())->assertOk();

        $response = $this->postJson('/api/ai/copilot/financial/evaluate', $this->offerPayload([
            'discount_percentage' => 4,
        ]));

        $response->assertOk();
        $this->assertContains($response->json('data.decision'), [
            'approved',
            'approved_with_warning',
            'manager_approval_required',
            'rejected',
            'incomplete',
            'invalid',
        ]);
        $this->assertArrayNotHasKey('calculation_trace', $response->json('data'));
        $this->assertStringNotContainsString('calculation_trace', (string) $response->getContent());

        $evaluation = FinancialEvaluation::query()->latest('id')->first();
        $this->assertNotNull($evaluation);
        $this->assertTrue(
            is_array($evaluation->calculation_trace) || $evaluation->calculation_trace === null
        );
        $stripped = FinancialEvaluationResource::stripTrace([
            'decision' => $evaluation->decision,
            'calculation_trace' => [['pv' => '1']],
        ]);
        $this->assertArrayNotHasKey('calculation_trace', $stripped);
    }

    public function test_chat_evaluates_financial_offer_when_flag_is_on(): void
    {
        $this->actingAsTenantUser($this->admin);
        $this->putJson('/api/financial-decision/settings', $this->settingsPayload())->assertOk();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'هل العرض مقبول lead 0 خصم 4% مقدم 20% لمدة 36 شهر',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'evaluate_financial_offer');
        $this->assertNotEmpty($response->json('data.message'));
        $this->assertStringNotContainsString('calculation_trace', (string) $response->getContent());
    }

    public function test_rejected_evaluate_includes_engine_max_discount_recommendation(): void
    {
        $this->actingAsTenantUser($this->admin);
        $this->putJson('/api/financial-decision/settings', $this->settingsPayload())->assertOk();

        $response = $this->postJson('/api/ai/copilot/financial/evaluate', $this->offerPayload([
            'discount_percentage' => 9,
            'duration_months' => 12,
        ]));

        $response->assertOk()
            ->assertJsonPath('data.decision', 'rejected');

        $recs = $response->json('data.recommendations') ?? [];
        $this->assertNotEmpty($recs);
        $codes = array_column($recs, 'code');
        $this->assertContains('max_discount_percentage', $codes);
        $this->assertStringContainsString('Maximum acceptable discount', (string) $response->json('data.message'));
        $this->assertStringContainsString('Discount exceeds the maximum allowed', (string) $response->json('data.message'));
        $this->assertStringNotContainsString('discount_exceeds_maximum', (string) $response->json('data.message'));
        $this->assertSame('financial_decision_card', $response->json('data.ui_actions.0.type'));
        $this->assertStringNotContainsString('calculation_trace', (string) $response->getContent());
    }

    public function test_max_discount_mode_returns_backend_owned_ceiling(): void
    {
        $this->actingAsTenantUser($this->admin);
        $this->putJson('/api/financial-decision/settings', $this->settingsPayload())->assertOk();

        $response = $this->postJson('/api/ai/copilot/financial/evaluate', $this->offerPayload([
            'mode' => 'max_discount',
            'intent' => 'max_discount',
            'discount_percentage' => null,
            'duration_months' => 12,
        ]));

        $response->assertOk();
        $this->assertContains($response->json('data.decision'), ['approved', 'approved_with_warning']);
        $recs = $response->json('data.recommendations') ?? [];
        $max = collect($recs)->firstWhere('code', 'max_discount_percentage');
        $this->assertNotNull($max);
        $this->assertSame('5.00', $max['value']);
        $this->assertStringContainsString('acceptable discount at 5%', (string) $response->json('data.message'));
        $this->assertSame('financial_decision_card', $response->json('data.ui_actions.0.type'));
        $this->assertSame('en', $response->json('data.ui_actions.0.locale'));
        $this->assertNotEmpty($response->json('data.ui_actions.0.narrative'));
    }

    public function test_chat_max_discount_uses_max_discount_tool(): void
    {
        $this->actingAsTenantUser($this->admin);
        $this->putJson('/api/financial-decision/settings', $this->settingsPayload())->assertOk();

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'ما هو أقصى خصم مقبول سعر الوحدة 1000000 مقدم 20% لمدة 12 شهر',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'max_discount');
        $this->assertStringContainsString('أقصى خصم مقبول', (string) $response->json('data.message'));
        $this->assertSame('financial_decision_card', $response->json('data.ui_actions.0.type'));
        $this->assertStringNotContainsString('discount_exceeds_maximum', (string) $response->getContent());
    }

    public function test_delayed_leads_still_use_original_copilot_when_financial_flag_is_on(): void
    {
        $this->actingAsTenantUser($this->admin);

        $response = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'show delayed leads',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.tool', 'list_delayed_leads');
    }

    public function test_flag_off_does_not_evaluate_financial_offer(): void
    {
        app(TenantFeatureService::class)->disableFeature($this->tenant, 'financial_decision_engine');
        Cache::flush();
        $this->actingAsTenantUser($this->admin);

        $chat = $this->postJson('/api/ai/copilot/chat', [
            'message' => 'هل العرض مقبول خصم 4% مقدم 20%',
        ]);
        $chat->assertOk();
        $this->assertNotSame('evaluate_financial_offer', $chat->json('data.tool'));

        $this->postJson('/api/ai/copilot/financial/evaluate', $this->offerPayload())
            ->assertStatus(403)
            ->assertJsonPath('feature', 'financial_decision_engine');
    }

    public function test_other_tenant_lead_is_not_visible(): void
    {
        $other = Tenant::factory()->create([
            'name' => 'Other Tenant',
            'slug' => 'other-financial-tenant',
            'domain' => 'other-financial-tenant.localhost',
        ]);
        $foreignLead = Lead::factory()->create([
            'tenant_id' => $other->id,
            'assigned_to' => $this->admin->id,
        ]);

        $this->actingAsTenantUser($this->admin);

        $response = $this->postJson('/api/ai/copilot/financial/evaluate', $this->offerPayload([
            'lead_id' => $foreignLead->id,
        ]));

        $response->assertOk()
            ->assertJsonPath('data.decision', 'invalid')
            ->assertJsonPath('data.reasons.0', 'lead_not_visible');
    }

    public function test_sales_person_cannot_evaluate_unassigned_lead(): void
    {
        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->admin->id,
            'manager_id' => $this->admin->id,
        ]);

        $this->actingAsTenantUser($this->user);

        $this->postJson('/api/ai/copilot/financial/evaluate', $this->offerPayload([
            'lead_id' => $lead->id,
        ]))->assertOk()
            ->assertJsonPath('data.decision', 'invalid')
            ->assertJsonPath('data.reasons.0', 'lead_not_visible');
    }

    public function test_adapter_does_not_write_contract_collection_tables(): void
    {
        $this->actingAsTenantUser($this->admin);
        $this->ensurePropertyColumns();

        $property = Property::query()->create([
            'tenant_id' => $this->tenant->id,
            'title' => 'Unit A',
            'unit_number' => 'A-1',
            'price' => 1000000,
            'discount' => 0,
            'discount_type' => 'amount',
            'total_after_discount' => 1000000,
            'installment_plans' => [[
                'downPayment' => 10,
                'downPaymentType' => 'percentage',
                'years' => 3,
                'installmentFrequency' => 'Monthly',
                'receiptAmount' => 0,
            ]],
        ]);

        $lead = Lead::factory()->create([
            'tenant_id' => $this->tenant->id,
            'assigned_to' => $this->admin->id,
            'item_id' => $property->id,
            'meta_data' => [
                'payment_plan' => [
                    'unitNo' => 'B-9',
                    'totalAmount' => 1000000,
                    'netAmount' => 1000000,
                    'downPayment' => 100000,
                    'noOfMonths' => 24,
                ],
            ],
        ]);

        $ccWrites = [];
        DB::listen(function ($query) use (&$ccWrites) {
            if (preg_match('/\bcc_/i', $query->sql) && preg_match('/\b(insert|update|delete)\b/i', $query->sql)) {
                $ccWrites[] = $query->sql;
            }
        });

        $resolved = app(RealEstateAdapter::class)->resolve(
            $this->admin->fresh(),
            app(FinancialRequestParser::class)->fromArray([
                'lead_id' => $lead->id,
                'discount_percentage' => 4,
            ]),
            now()->toDateString()
        );

        $this->assertSame([], $ccWrites);
        $this->assertTrue($resolved['ok']);
        $this->assertSame('property_installment_plans', $resolved['source']->sourceType);
        $this->assertNotSame('lead_payment_plan', $resolved['source']->sourceType);
    }

    public function test_confidence_is_persisted_but_does_not_change_decision(): void
    {
        $this->actingAsTenantUser($this->admin);
        $this->putJson('/api/financial-decision/settings', $this->settingsPayload())->assertOk();

        $response = $this->postJson('/api/ai/copilot/financial/evaluate', $this->offerPayload([
            'discount_percentage' => 4,
        ]));

        $response->assertOk();
        $this->assertArrayHasKey('confidence', $response->json('data.input_source') ?? []);
        $this->assertNotSame('rejected', $response->json('data.decision'));
        $this->assertNotSame('invalid', $response->json('data.decision'));
    }

    /**
     * @param  array<string,mixed>  $overrides
     * @return array<string,mixed>
     */
    private function offerPayload(array $overrides = []): array
    {
        return array_merge([
            'intent' => 'evaluate',
            'gross_amount' => 1000000,
            'discount_percentage' => 4,
            'down_payment_percentage' => 20,
            'duration_months' => 36,
            'frequency' => 'monthly',
        ], $overrides);
    }

    /**
     * @return array<string,mixed>
     */
    private function settingsPayload(string $rate = '0.1200', string $minRatio = '0.80'): array
    {
        return [
            'discount_rate' => $rate,
            'day_count_convention' => 'actual_365',
            'compounding_frequency' => 'annual',
            'minimum_npv_ratio' => $minRatio,
            'minimum_initial_collection_percentage' => 10,
            'maximum_discount_percentage' => 5,
            'manager_maximum_discount_percentage' => 8,
            'maximum_duration_months' => 96,
        ];
    }

    private function actingAsTenantUser(User $user): void
    {
        Sanctum::actingAs($user);
        app()->instance('tenant', $this->tenant);
        app()->instance('current_tenant_id', $this->tenant->id);
    }

    private function ensurePropertyColumns(): void
    {
        if (! Schema::hasTable('properties')) {
            Schema::create('properties', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tenant_id')->nullable();
                $table->string('title')->nullable();
                $table->string('unit_number')->nullable();
                $table->decimal('price', 15, 2)->nullable();
                $table->decimal('discount', 15, 2)->nullable();
                $table->string('discount_type')->nullable();
                $table->decimal('total_after_discount', 15, 2)->nullable();
                $table->json('installment_plans')->nullable();
                $table->timestamps();
            });
        }
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
