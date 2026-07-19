<?php

namespace App\Http\Controllers;

use App\Models\Stage;
use App\Models\Lead;
use App\Services\TelesalesService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class StageController extends Controller
{
    private const TELESALES_FIXED_STAGES = [
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

    private const SALES_FIXED_STAGES = [
        [
            'system_key' => 'sales_new_lead',
            'name' => 'New Lead',
            'name_ar' => 'عميل جديد',
            'type' => 'new_lead',
            'order' => -20,
            'color' => '#3B82F6',
            'icon' => 'Sparkles',
        ],
        [
            'system_key' => 'sales_cold_calls',
            'name' => 'Cold Calls',
            'name_ar' => 'مكالمات باردة',
            'type' => 'cold_calls',
            'order' => -10,
            'color' => '#0EA5E9',
            'icon' => 'Phone',
        ],
    ];

    private function stageNames(Stage $stage): array
    {
        return array_values(array_unique(array_filter([
            trim((string) $stage->name),
            trim((string) $stage->name_ar),
        ])));
    }

    private function currentTenantId(): ?int
    {
        if (app()->bound('current_tenant_id')) {
            return (int) app('current_tenant_id');
        }

        return Auth::user()?->tenant_id ? (int) Auth::user()->tenant_id : null;
    }

    private function isLockedStage(Stage $stage): bool
    {
        $meta = is_array($stage->meta_data ?? null) ? ($stage->meta_data ?? []) : [];
        return (bool) ($meta['locked'] ?? false);
    }

    private function ensureTelesalesFixedStages(): void
    {
        $tenantId = $this->currentTenantId();
        if (!$tenantId) {
            return;
        }

        foreach (self::TELESALES_FIXED_STAGES as $stageData) {
            $metaData = [
                'locked' => true,
                'system_key' => $stageData['system_key'],
                'display_only' => $stageData['display_only'],
            ];

            $existing = Stage::query()
                ->where('workflow_key', TelesalesService::WORKFLOW_TELESALES)
                ->where(function ($query) use ($stageData, $metaData) {
                    $query->where('name', $stageData['name'])
                        ->orWhere('name_ar', $stageData['name_ar'])
                        ->orWhere('meta_data->system_key', $metaData['system_key']);
                })
                ->first();

            if ($existing) {
                $mergedMeta = array_merge(is_array($existing->meta_data ?? null) ? ($existing->meta_data ?? []) : [], $metaData);
                $existing->forceFill([
                    'meta_data' => $mergedMeta,
                    'workflow_key' => TelesalesService::WORKFLOW_TELESALES,
                    'is_active' => true,
                ])->save();
                continue;
            }

            Stage::create([
                'tenant_id' => $tenantId,
                'name' => $stageData['name'],
                'name_ar' => $stageData['name_ar'],
                'type' => $stageData['type'],
                'workflow_key' => TelesalesService::WORKFLOW_TELESALES,
                'is_active' => true,
                'order' => $stageData['order'],
                'color' => $stageData['color'],
                'icon' => $stageData['icon'],
                'meta_data' => $metaData,
            ]);
        }
    }

    private function ensureSalesFixedStages(): void
    {
        $tenantId = $this->currentTenantId();
        if (!$tenantId) {
            return;
        }

        foreach (self::SALES_FIXED_STAGES as $stageData) {
            $metaData = [
                'locked' => true,
                'hidden' => true,
                'system_key' => $stageData['system_key'],
            ];

            $existing = Stage::query()
                ->where('tenant_id', $tenantId)
                ->where(function ($query) use ($stageData, $metaData) {
                    $query->where('meta_data->system_key', $metaData['system_key'])
                        ->orWhere(function ($q) use ($stageData) {
                            $q->where('name', $stageData['name'])
                                ->where(function ($q2) {
                                    $q2->where('workflow_key', TelesalesService::WORKFLOW_SALES)
                                        ->orWhereNull('workflow_key')
                                        ->orWhere('workflow_key', '');
                                });
                        });
                })
                ->first();

            if ($existing) {
                $mergedMeta = array_merge(is_array($existing->meta_data ?? null) ? ($existing->meta_data ?? []) : [], $metaData);
                $existing->forceFill([
                    'meta_data' => $mergedMeta,
                    'workflow_key' => TelesalesService::WORKFLOW_SALES,
                    'is_active' => true,
                ])->save();
                continue;
            }

            Stage::create([
                'tenant_id' => $tenantId,
                'name' => $stageData['name'],
                'name_ar' => $stageData['name_ar'],
                'type' => $stageData['type'],
                'workflow_key' => TelesalesService::WORKFLOW_SALES,
                'is_active' => true,
                'order' => $stageData['order'],
                'color' => $stageData['color'],
                'icon' => $stageData['icon'],
                'meta_data' => $metaData,
            ]);
        }
    }

    private function linkedLeadsQuery(Stage $stage)
    {
        $stageNames = $this->stageNames($stage);

        return Lead::query()->where(function ($query) use ($stageNames, $stage) {
            $query->where('stage_id', $stage->id);
            foreach ($stageNames as $stageName) {
                $query->orWhereRaw('LOWER(TRIM(stage)) = ?', [strtolower($stageName)]);
            }
        });
    }

    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        $workflowKey = strtolower(trim((string) request()->query('workflow_key', '')));
        $activeOnly = filter_var(request()->query('active', false), FILTER_VALIDATE_BOOL);

        if ($workflowKey === TelesalesService::WORKFLOW_TELESALES) {
            $this->ensureTelesalesFixedStages();
        } elseif ($workflowKey === TelesalesService::WORKFLOW_SALES) {
            $this->ensureSalesFixedStages();
        }

        $query = Stage::query()->orderBy('order')->orderBy('id');
        if ($workflowKey === TelesalesService::WORKFLOW_SALES) {
            // Backward compatibility: legacy sales stages may not have workflow_key populated.
            $query->where(function ($q) use ($workflowKey) {
                $q->where('workflow_key', $workflowKey)
                    ->orWhereNull('workflow_key')
                    ->orWhere('workflow_key', '');
            });
        } elseif ($workflowKey === TelesalesService::WORKFLOW_TELESALES) {
            $query->where('workflow_key', $workflowKey);
        }
        if ($activeOnly) {
            $query->where(function ($q) {
                $q->where('is_active', true)
                    ->orWhereNull('is_active');
            });
        }

        $stages = $query->get()->reject(function (Stage $stage) {
            $meta = is_array($stage->meta_data ?? null) ? ($stage->meta_data ?? []) : [];
            return (bool) ($meta['hidden'] ?? false);
        })->values();

        return response()->json($stages);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'name_ar' => 'nullable|string|max:255',
            'type' => 'required|string',
            'workflow_key' => 'required|in:sales,telesales',
            'is_active' => 'nullable|boolean',
            'notify_time' => 'nullable|string|max:20',
            'delay_time' => 'nullable|integer|min:0',
            'order' => 'integer',
            'color' => 'nullable|string',
            'icon' => 'nullable|string',
        ]);

        if (($validated['workflow_key'] ?? null) === TelesalesService::WORKFLOW_TELESALES) {
            $this->ensureTelesalesFixedStages();
        }

        $stage = Stage::create($validated);
        return response()->json($stage, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Stage $stage)
    {
        return response()->json($stage);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Stage $stage)
    {
        if ($this->isLockedStage($stage)) {
            return response()->json([
                'message' => 'This telesales stage is fixed and cannot be edited.',
            ], 422);
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'name_ar' => 'nullable|string|max:255',
            'type' => 'sometimes|required|string',
            'workflow_key' => 'sometimes|required|in:sales,telesales',
            'is_active' => 'nullable|boolean',
            'notify_time' => 'nullable|string|max:20',
            'delay_time' => 'nullable|integer|min:0',
            'order' => 'integer',
            'color' => 'nullable|string',
            'icon' => 'nullable|string',
        ]);

        if (array_key_exists('workflow_key', $validated)) {
            $linkedLeadsCount = $this->linkedLeadsQuery($stage)->count();
            if ($linkedLeadsCount > 0 && $validated['workflow_key'] !== $stage->workflow_key) {
                return response()->json([
                    'message' => 'Cannot move a stage to another workflow while leads are linked to it.',
                    'linked_leads_count' => $linkedLeadsCount,
                ], 409);
            }
        }

        $stage->update($validated);
        return response()->json($stage);
    }

    /**
     * Update the order of stages.
     */
    public function reorder(Request $request)
    {
        $validated = $request->validate([
            'stages' => 'required|array',
            'stages.*.id' => 'required|exists:stages,id',
            'stages.*.order' => 'required|integer',
        ]);

        $stages = Stage::query()->whereIn('id', collect($validated['stages'])->pluck('id')->all())->get(['id', 'workflow_key', 'meta_data']);
        $workflowKeys = $stages->pluck('workflow_key')->filter()->unique()->values();
        if ($workflowKeys->count() > 1) {
            return response()->json(['message' => 'Stages can only be reordered within the same workflow.'], 422);
        }

        if ($stages->contains(fn (Stage $stage) => $this->isLockedStage($stage))) {
            return response()->json(['message' => 'Fixed telesales stages cannot be reordered.'], 422);
        }

        foreach ($validated['stages'] as $stageData) {
            Stage::where('id', $stageData['id'])->update(['order' => $stageData['order']]);
        }

        return response()->json(['message' => 'Stages reordered successfully']);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, Stage $stage)
    {
        if ($this->isLockedStage($stage)) {
            return response()->json([
                'message' => 'This telesales stage is fixed and cannot be deleted.',
            ], 422);
        }

        $linkedLeadsCount = $this->linkedLeadsQuery($stage)->count();

        if ($linkedLeadsCount > 0) {
            $targetStageId = (int) $request->input('target_stage_id');

            if ($targetStageId <= 0) {
                return response()->json([
                    'message' => 'Cannot delete this stage while leads are linked to it. Please move these leads to another stage first.',
                    'linked_leads_count' => $linkedLeadsCount,
                    'requires_transfer' => true,
                ], 409);
            }

            $targetStage = Stage::query()->find($targetStageId);
            if (!$targetStage || (int) $targetStage->id === (int) $stage->id) {
                return response()->json([
                    'message' => 'Please choose a valid target stage before deleting this stage.',
                ], 422);
            }

            DB::transaction(function () use ($stage, $targetStage) {
                $this->linkedLeadsQuery($stage)->update([
                    'stage' => trim((string) $targetStage->name),
                ]);

                $stage->delete();
            });

            return response()->json([
                'message' => 'Stage deleted and linked leads moved successfully.',
                'linked_leads_count' => $linkedLeadsCount,
                'moved_to_stage_id' => (int) $targetStage->id,
            ]);
        }

        $stage->delete();
        return response()->json(null, 204);
    }
}
