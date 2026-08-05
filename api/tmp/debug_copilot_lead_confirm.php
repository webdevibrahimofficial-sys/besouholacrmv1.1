<?php

use App\Models\Feature;
use App\Models\Stage;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TenantFeatureService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\Sanctum;

require __DIR__.'/../vendor/autoload.php';

$app = require __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

Cache::flush();

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

$tenant = Tenant::factory()->create([
    'name' => 'Copilot Tenant',
    'slug' => 'copilot-tenant',
    'domain' => 'copilot-tenant.localhost',
]);

$user = User::factory()->create([
    'tenant_id' => $tenant->id,
    'email' => 'copilot-lead@example.com',
]);

Feature::firstOrCreate([
    'key' => 'besouhola_copilot',
], [
    'name' => 'Besouhola Copilot',
    'description' => 'AI copilot',
    'is_active' => true,
]);

app(TenantFeatureService::class)->enableFeature($tenant, 'besouhola_copilot');

Stage::create([
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

Sanctum::actingAs($user);
app()->instance('tenant', $tenant);
app()->instance('currentTenant', $tenant);
app()->instance('current_tenant_id', $tenant->id);

$request = Illuminate\Http\Request::create('/api/ai/copilot/actions/confirm', 'POST', [
    'action' => 'create_lead',
    'payload' => [
        'name' => 'Ahmed Copilot',
        'phone' => '01012345678',
        'email' => 'ahmed.copilot@example.com',
    ],
]);

$request->headers->set('Accept', 'application/json');
$request->setUserResolver(fn () => $user);

$response = $app->handle($request);

echo "STATUS=".$response->getStatusCode().PHP_EOL;
echo $response->getContent().PHP_EOL;
