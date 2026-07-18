<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stages', function (Blueprint $table) {
            if (!Schema::hasColumn('stages', 'workflow_key')) {
                $table->string('workflow_key')->default('sales')->after('type');
            }
            if (!Schema::hasColumn('stages', 'is_active')) {
                $table->boolean('is_active')->default(true)->after('workflow_key');
            }
        });

        Schema::table('leads', function (Blueprint $table) {
            if (!Schema::hasColumn('leads', 'workflow_key')) {
                $table->string('workflow_key')->default('sales')->after('stage');
            }
            if (!Schema::hasColumn('leads', 'stage_id')) {
                $table->unsignedBigInteger('stage_id')->nullable()->after('workflow_key');
            }
            if (!Schema::hasColumn('leads', 'workflow_entered_at')) {
                $table->timestamp('workflow_entered_at')->nullable()->after('stage_id');
            }
            if (!Schema::hasColumn('leads', 'transferred_to_sales_at')) {
                $table->timestamp('transferred_to_sales_at')->nullable()->after('workflow_entered_at');
            }
            if (!Schema::hasColumn('leads', 'qualified_by')) {
                $table->unsignedBigInteger('qualified_by')->nullable()->after('transferred_to_sales_at');
            }
        });

        Schema::create('lead_workflow_history', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->nullable()->index();
            $table->unsignedBigInteger('lead_id')->index();
            $table->string('from_workflow')->nullable();
            $table->string('to_workflow')->nullable();
            $table->unsignedBigInteger('from_stage_id')->nullable();
            $table->unsignedBigInteger('to_stage_id')->nullable();
            $table->string('action');
            $table->unsignedBigInteger('performed_by')->nullable();
            $table->json('meta_data')->nullable();
            $table->timestamps();
        });

        DB::table('stages')
            ->whereNull('workflow_key')
            ->orWhere('workflow_key', '')
            ->update([
                'workflow_key' => 'sales',
                'is_active' => true,
            ]);

        $stages = DB::table('stages')
            ->select('id', 'tenant_id', 'name', 'name_ar', 'workflow_key')
            ->orderBy('id')
            ->get();

        $stageMap = [];
        foreach ($stages as $stage) {
            $tenantId = (int) ($stage->tenant_id ?? 0);
            foreach ([$stage->name, $stage->name_ar] as $label) {
                $normalized = strtolower(trim((string) $label));
                if ($normalized === '') {
                    continue;
                }
                $stageMap[$tenantId][$normalized] = (int) $stage->id;
            }
        }

        $leads = DB::table('leads')
            ->select('id', 'tenant_id', 'stage', 'created_at')
            ->orderBy('id')
            ->get();

        foreach ($leads as $lead) {
            $tenantId = (int) ($lead->tenant_id ?? 0);
            $normalizedStage = strtolower(trim((string) ($lead->stage ?? '')));
            $resolvedStageId = $stageMap[$tenantId][$normalizedStage] ?? $stageMap[0][$normalizedStage] ?? null;

            DB::table('leads')
                ->where('id', $lead->id)
                ->update([
                    'workflow_key' => 'sales',
                    'stage_id' => $resolvedStageId,
                    'workflow_entered_at' => $lead->created_at ?? now(),
                ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('lead_workflow_history');

        Schema::table('leads', function (Blueprint $table) {
            foreach (['qualified_by', 'transferred_to_sales_at', 'workflow_entered_at', 'stage_id', 'workflow_key'] as $column) {
                if (Schema::hasColumn('leads', $column)) {
                    $table->dropColumn($column);
                }
            }
        });

        Schema::table('stages', function (Blueprint $table) {
            foreach (['is_active', 'workflow_key'] as $column) {
                if (Schema::hasColumn('stages', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
