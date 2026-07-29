<?php

use App\Services\TelesalesService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private array $stages = [
        [
            'system_key' => 'telesales_fresh',
            'name' => 'fresh',
            'name_ar' => 'جديد',
            'type' => 'fresh',
            'order' => 1,
            'color' => '#3B82F6',
            'icon' => 'BarChart2',
            'display_only' => false,
        ],
        [
            'system_key' => 'telesales_duplicate',
            'name' => 'Duplicate',
            'name_ar' => 'مكرر',
            'type' => 'display',
            'order' => 2,
            'color' => '#F59E0B',
            'icon' => 'Copy',
            'display_only' => true,
        ],
        [
            'system_key' => 'telesales_pending',
            'name' => 'Pending',
            'name_ar' => 'معلق',
            'type' => 'display',
            'order' => 3,
            'color' => '#64748B',
            'icon' => 'List',
            'display_only' => true,
        ],
        [
            'system_key' => 'telesales_cold_calls',
            'name' => 'Cold Calls',
            'name_ar' => 'مكالمات باردة',
            'type' => 'cold_calls',
            'order' => 4,
            'color' => '#0EA5E9',
            'icon' => 'Phone',
            'display_only' => false,
        ],
    ];

    public function up(): void
    {
        $tenantIds = DB::table('tenants')->pluck('id');
        $now = now();

        foreach ($tenantIds as $tenantId) {
            foreach ($this->stages as $stage) {
                $existing = DB::table('stages')
                    ->where('tenant_id', $tenantId)
                    ->where('workflow_key', TelesalesService::WORKFLOW_TELESALES)
                    ->where(function ($query) use ($stage) {
                        $query->where('name', $stage['name'])
                            ->orWhere('name_ar', $stage['name_ar']);
                    })
                    ->first();

                $metaData = json_encode([
                    'locked' => true,
                    'system_key' => $stage['system_key'],
                    'display_only' => $stage['display_only'],
                ], JSON_UNESCAPED_UNICODE);

                if ($existing) {
                    DB::table('stages')
                        ->where('id', $existing->id)
                        ->update([
                            'workflow_key' => TelesalesService::WORKFLOW_TELESALES,
                            'is_active' => 1,
                            'meta_data' => $metaData,
                            'updated_at' => $now,
                        ]);
                    continue;
                }

                DB::table('stages')->insert([
                    'tenant_id' => $tenantId,
                    'name' => $stage['name'],
                    'name_ar' => $stage['name_ar'],
                    'type' => $stage['type'],
                    'workflow_key' => TelesalesService::WORKFLOW_TELESALES,
                    'is_active' => 1,
                    'order' => $stage['order'],
                    'color' => $stage['color'],
                    'icon' => $stage['icon'],
                    'meta_data' => $metaData,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
        }
    }

    public function down(): void
    {
        foreach ($this->stages as $stage) {
            DB::table('stages')
                ->where('workflow_key', TelesalesService::WORKFLOW_TELESALES)
                ->where('name', $stage['name'])
                ->delete();
        }
    }
};
