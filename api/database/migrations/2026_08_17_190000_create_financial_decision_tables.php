<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('financial_assumptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->decimal('discount_rate', 8, 4)->nullable();
            $table->string('day_count_convention')->default('actual_365');
            $table->string('compounding_frequency')->default('annual');
            $table->string('rounding_rule')->default('round_half_up_2');
            $table->boolean('is_explicitly_configured')->default(false);
            $table->timestamp('configured_at')->nullable();
            $table->foreignId('configured_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique('tenant_id');
        });

        Schema::create('financial_policies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name')->default('Default');
            $table->boolean('is_active')->default(true);
            $table->boolean('is_explicitly_configured')->default(false);
            $table->timestamps();
            $table->unique('tenant_id');
        });

        Schema::create('financial_policy_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('policy_id')->constrained('financial_policies')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->json('thresholds');
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['policy_id', 'version']);
        });

        Schema::create('financial_evaluations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->nullableMorphs('evaluable');
            $table->json('input')->nullable();
            $table->json('cash_flows')->nullable();
            $table->json('metrics')->nullable();
            $table->json('decision_payload')->nullable();
            $table->json('assumptions_snapshot')->nullable();
            $table->json('input_source')->nullable();
            $table->json('calculation_trace')->nullable();
            $table->foreignId('policy_version_id')->nullable()->constrained('financial_policy_versions')->nullOnDelete();
            $table->string('engine_version')->default('1.0.0');
            $table->string('decision');
            $table->string('status');
            $table->timestamps();
            $table->index(['tenant_id', 'decision']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_evaluations');
        Schema::dropIfExists('financial_policy_versions');
        Schema::dropIfExists('financial_policies');
        Schema::dropIfExists('financial_assumptions');
    }
};
