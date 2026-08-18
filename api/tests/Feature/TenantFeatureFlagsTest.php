<?php

namespace Tests\Feature;

use App\Models\Feature;
use App\Models\Tenant;
use App\Models\User;
use App\Http\Middleware\EnsureTenantHasFeature;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TenantFeatureFlagsTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;
    protected User $superAdmin;
    protected User $tenantUser;
    protected Feature $feature;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

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

        if (
            Schema::connection('landlord')->hasTable('tenants')
            && ! Schema::connection('landlord')->hasColumn('tenants', 'archived_at')
        ) {
            Schema::connection('landlord')->table('tenants', function (Blueprint $table) {
                $table->timestamp('archived_at')->nullable();
            });
        }

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

        foreach ([
            ['code' => 'basic', 'name' => 'Basic'],
            ['code' => 'enterprise', 'name' => 'Enterprise'],
        ] as $plan) {
            DB::connection('landlord')->table('subscription_plans')->updateOrInsert(
                ['code' => $plan['code']],
                [
                    'name' => $plan['name'],
                    'is_active' => true,
                    'modules' => json_encode([]),
                    'company_type_overrides' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
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

        if (! Schema::connection('landlord')->hasTable('tenant_backups')) {
            Schema::connection('landlord')->create('tenant_backups', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $table->string('status')->nullable();
                $table->timestamp('finished_at')->nullable();
                $table->timestamps();
            });
        }

        $this->tenant = Tenant::factory()->create([
            'name' => 'Feature Tenant',
            'slug' => 'feature-tenant',
            'domain' => 'feature-tenant.localhost',
        ]);

        $this->tenantUser = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'email' => 'tenant@example.com',
        ]);

        $this->superAdmin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'is_super_admin' => true,
            'email' => 'superadmin@example.com',
        ]);

        $this->feature = Feature::firstOrCreate([
            'key' => 'besouhola_copilot',
        ], [
            'name' => 'Besouhola Copilot',
            'description' => 'AI copilot for reports, filters, delayed leads, and tasks.',
            'is_active' => true,
        ]);
    }

    public function test_super_admin_can_toggle_tenant_feature_via_update(): void
    {
        Sanctum::actingAs($this->superAdmin);

        $response = $this->putJson("/api/super-admin/tenants/{$this->tenant->id}", [
            'subscription_plan' => 'basic',
            'features' => [
                [
                    'key' => 'besouhola_copilot',
                    'is_enabled' => true,
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('tenant.features.besouhola_copilot', true);

        $this->assertDatabaseHas('tenant_features', [
            'tenant_id' => $this->tenant->id,
            'feature_id' => $this->feature->id,
            'is_enabled' => true,
        ], 'landlord');
    }

    public function test_super_admin_can_toggle_financial_decision_engine_via_update(): void
    {
        $financialFeature = Feature::firstOrCreate([
            'key' => 'financial_decision_engine',
        ], [
            'name' => 'Financial Decision Engine',
            'description' => 'NPV policy engine',
            'is_active' => true,
        ]);

        Sanctum::actingAs($this->superAdmin);

        $response = $this->putJson("/api/super-admin/tenants/{$this->tenant->id}", [
            'subscription_plan' => 'basic',
            'features' => [
                [
                    'key' => 'besouhola_copilot',
                    'is_enabled' => true,
                ],
                [
                    'key' => 'financial_decision_engine',
                    'is_enabled' => true,
                ],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('tenant.features.financial_decision_engine', true);

        $this->assertDatabaseHas('tenant_features', [
            'tenant_id' => $this->tenant->id,
            'feature_id' => $financialFeature->id,
            'is_enabled' => true,
        ], 'landlord');
    }

    public function test_update_without_features_keeps_existing_feature_state(): void
    {
        $this->tenant->features()->syncWithoutDetaching([
            $this->feature->id => [
                'is_enabled' => true,
                'enabled_at' => now(),
            ],
        ]);

        Sanctum::actingAs($this->superAdmin);

        $response = $this->putJson("/api/super-admin/tenants/{$this->tenant->id}", [
            'subscription_plan' => 'enterprise',
        ]);

        $response->assertOk()
            ->assertJsonPath('tenant.features.besouhola_copilot', true);

        $this->assertDatabaseHas('tenant_features', [
            'tenant_id' => $this->tenant->id,
            'feature_id' => $this->feature->id,
            'is_enabled' => true,
        ], 'landlord');
    }

    public function test_super_admin_tenants_list_returns_feature_map(): void
    {
        $this->tenant->features()->syncWithoutDetaching([
            $this->feature->id => [
                'is_enabled' => true,
                'enabled_at' => now(),
            ],
        ]);

        Sanctum::actingAs($this->superAdmin);

        $response = $this->getJson("/api/super-admin/tenants?tenant_id={$this->tenant->id}");

        $response->assertOk();

        $tenant = collect($response->json('tenants.data') ?? [])
            ->first();

        $this->assertNotNull($tenant, json_encode($response->json(), JSON_PRETTY_PRINT));
        $this->assertTrue((bool) data_get($tenant, 'features.besouhola_copilot'));
    }

    public function test_me_includes_tenant_feature_map(): void
    {
        $this->tenant->features()->syncWithoutDetaching([
            $this->feature->id => [
                'is_enabled' => true,
                'enabled_at' => now(),
            ],
        ]);

        Sanctum::actingAs($this->tenantUser);
        app()->instance('tenant', $this->tenant);
        app()->instance('current_tenant_id', $this->tenant->id);

        $response = $this->getJson('/api/me');

        $response->assertOk()
            ->assertJsonPath('tenant.features.besouhola_copilot', true);
    }

    public function test_feature_middleware_blocks_disabled_feature(): void
    {
        Cache::flush();

        $tenant = Tenant::factory()->create([
            'name' => 'Disabled Feature Tenant',
            'slug' => 'disabled-feature-tenant',
            'domain' => 'disabled-feature-tenant.localhost',
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email' => 'disabled-feature@example.com',
        ]);

        Sanctum::actingAs($user);
        app()->instance('tenant', $tenant);
        app()->instance('current_tenant_id', $tenant->id);

        $request = Request::create('/_test/tenant-feature-protected', 'GET');
        $request->setUserResolver(fn () => $user);

        $middleware = app(EnsureTenantHasFeature::class);
        $response = $middleware->handle($request, fn () => response()->json(['ok' => true]), 'besouhola_copilot');

        $this->assertSame(403, $response->getStatusCode());
        $this->assertSame('besouhola_copilot', data_get($response->getData(true), 'feature'));
    }
}
