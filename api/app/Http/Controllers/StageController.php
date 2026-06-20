<?php

namespace App\Http\Controllers;

use App\Models\Stage;
use App\Models\Lead;
use Illuminate\Http\Request;

class StageController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        // BelongsToTenant trait should automatically filter by tenant if tenant context is set.
        // If no tenant context (e.g. global stages), it might need adjustment, but for now assume standard usage.
        $stages = Stage::orderBy('order')->get();
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
            'notify_time' => 'nullable|string|max:20',
            'delay_time' => 'nullable|integer|min:0',
            'order' => 'integer',
            'color' => 'nullable|string',
            'icon' => 'nullable|string',
        ]);

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
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'name_ar' => 'nullable|string|max:255',
            'type' => 'sometimes|required|string',
            'notify_time' => 'nullable|string|max:20',
            'delay_time' => 'nullable|integer|min:0',
            'order' => 'integer',
            'color' => 'nullable|string',
            'icon' => 'nullable|string',
        ]);

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

        foreach ($validated['stages'] as $stageData) {
            Stage::where('id', $stageData['id'])->update(['order' => $stageData['order']]);
        }

        return response()->json(['message' => 'Stages reordered successfully']);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Stage $stage)
    {
        $stageNames = array_values(array_filter([
            trim((string) $stage->name),
            trim((string) $stage->name_ar),
        ]));

        $linkedLeadsCount = 0;

        if (!empty($stageNames)) {
            $linkedLeadsCount = Lead::query()
                ->where(function ($query) use ($stageNames) {
                    foreach ($stageNames as $stageName) {
                        $query->orWhereRaw('LOWER(TRIM(stage)) = ?', [strtolower($stageName)]);
                    }
                })
                ->count();
        }

        if ($linkedLeadsCount > 0) {
            return response()->json([
                'message' => 'Cannot delete this stage while leads are linked to it. Please move these leads to another stage first.',
                'linked_leads_count' => $linkedLeadsCount,
            ], 409);
        }

        $stage->delete();
        return response()->json(null, 204);
    }
}
