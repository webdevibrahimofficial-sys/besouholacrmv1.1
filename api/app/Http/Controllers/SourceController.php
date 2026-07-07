<?php

namespace App\Http\Controllers;

use App\Models\Source;
use App\Models\Lead;
use Illuminate\Http\Request;

class SourceController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        try {
            $query = Source::query();
            
            if ($request->boolean('active')) {
                 $query->where('is_active', true);
            }

            if ($request->filled('search')) {
                $search = $request->string('search')->toString();
                $query->where('name', 'like', "%{$search}%");
            }

            $sources = $query->latest()->get();
            return response()->json($sources);
        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Failed to fetch sources',
                'error' => app()->hasDebugMode() && config('app.debug') ? $e->getMessage() : null,
            ], 500);
        }
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'is_active' => 'boolean'
        ]);

        $source = Source::create($validated);

        return response()->json($source, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Source $source)
    {
        return $source;
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Source $source)
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'is_active' => 'boolean'
        ]);

        $source->update($validated);

        return response()->json($source);
    }

    /**
     * Remove the specified resource from storage.
     *
     * If leads are still linked to this source, refuse to delete unless the
     * caller explicitly provides `reassign_to_source_id` to bulk-move those
     * leads to another source first (handled atomically before deletion).
     */
    public function destroy(Request $request, Source $source)
    {
        $leadsQuery = Lead::withTrashed()->where('source', $source->name);
        $leadsCount = $leadsQuery->count();

        if ($leadsCount > 0) {
            $reassignToId = $request->input('reassign_to_source_id');

            if (!$reassignToId) {
                return response()->json([
                    'message' => "لا يمكن حذف هذا المصدر لأنه مرتبط بـ {$leadsCount} ليد. اختر مصدرًا بديلًا لتحويل الليدز إليه قبل الحذف.",
                    'leads_count' => $leadsCount,
                    'requires_reassignment' => true,
                ], 422);
            }

            $targetSource = Source::find($reassignToId);

            if (!$targetSource) {
                return response()->json([
                    'message' => 'المصدر المطلوب التحويل إليه غير موجود.',
                ], 422);
            }

            if ((int) $targetSource->id === (int) $source->id) {
                return response()->json([
                    'message' => 'لا يمكن التحويل لنفس المصدر.',
                ], 422);
            }

            $leadsQuery->update(['source' => $targetSource->name]);
        }

        $source->delete();
        return response()->json(null, 204);
    }
}
