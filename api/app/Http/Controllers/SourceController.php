<?php

namespace App\Http\Controllers;

use App\Models\Source;
use App\Models\Lead;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SourceController extends Controller
{
    private function hydrateArabicName(Source $source, bool $supportsArabicName): Source
    {
        if ($supportsArabicName) {
            return $source;
        }

        $meta = $source->meta_data;
        $source->setAttribute(
            'name_ar',
            is_array($meta) && array_key_exists('name_ar', $meta) ? $meta['name_ar'] : null
        );

        return $source;
    }

    private function supportsArabicName(): bool
    {
        $model = new Source();
        $connectionName = $model->getConnectionName();
        $connection = DB::connection($connectionName);
        $schema = $connection->getSchemaBuilder();

        return $schema->hasTable($model->getTable()) && $schema->hasColumn($model->getTable(), 'name_ar');
    }

    private function sanitizePayload(array $validated): array
    {
        if (!$this->supportsArabicName()) {
            $nameAr = array_key_exists('name_ar', $validated)
                ? trim((string) ($validated['name_ar'] ?? ''))
                : null;

            unset($validated['name_ar']);

            $meta = $validated['meta_data'] ?? [];
            if (!is_array($meta)) {
                $meta = [];
            }

            if ($nameAr !== null) {
                if ($nameAr === '') {
                    unset($meta['name_ar']);
                } else {
                    $meta['name_ar'] = $nameAr;
                }
            }

            $validated['meta_data'] = $meta;
        }

        return $validated;
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        try {
            $query = Source::query();
            $supportsArabicName = $this->supportsArabicName();
            
            if ($request->boolean('active')) {
                 $query->where('is_active', true);
            }

            if ($request->filled('search')) {
                $search = $request->string('search')->toString();
                $query->where(function ($subQuery) use ($search) {
                    $subQuery->where('name', 'like', "%{$search}%");
                    if ($this->supportsArabicName()) {
                        $subQuery->orWhere('name_ar', 'like', "%{$search}%");
                    }
                });
            }

            $select = ['id', 'tenant_id', 'name', 'is_active', 'meta_data', 'created_at', 'updated_at'];
            if ($supportsArabicName) {
                array_splice($select, 3, 0, 'name_ar');
            }

            $sources = $query->latest()->get($select)
                ->map(fn (Source $source) => $this->hydrateArabicName($source, $supportsArabicName));
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
            'name_ar' => 'nullable|string|max:255',
            'is_active' => 'boolean'
        ]);

        $supportsArabicName = $this->supportsArabicName();
        $source = Source::create($this->sanitizePayload($validated));

        return response()->json($this->hydrateArabicName($source->fresh(), $supportsArabicName), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Source $source)
    {
        return $this->hydrateArabicName($source, $this->supportsArabicName());
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Source $source)
    {
        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'name_ar' => 'nullable|string|max:255',
            'is_active' => 'boolean'
        ]);

        $supportsArabicName = $this->supportsArabicName();
        $source->update($this->sanitizePayload($validated));

        return response()->json($this->hydrateArabicName($source->fresh(), $supportsArabicName));
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
