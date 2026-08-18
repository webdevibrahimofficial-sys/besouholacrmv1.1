<?php

namespace App\Http\Controllers;

use App\Models\InventoryLookup;
use App\Services\GeneralInventory\InventoryLookupService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class InventoryLookupController extends Controller
{
    public function __construct(
        private readonly InventoryLookupService $lookups,
    ) {
    }

    public function serviceTypes(Request $request)
    {
        $tenantId = $request->user()?->tenant_id;
        $activeOnly = $request->boolean('active_only');

        return response()->json(
            $this->lookups->listServiceTypes($tenantId, $activeOnly)->values()
        );
    }

    public function storeServiceType(Request $request)
    {
        $tenantId = $request->user()?->tenant_id;
        $this->lookups->ensureServiceTypeDefaults($tenantId);

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:50',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $name = trim((string) $request->input('name'));
        $exists = InventoryLookup::query()
            ->where('tenant_id', $tenantId)
            ->where('lookup_type', InventoryLookup::TYPE_SERVICE_TYPE)
            ->whereRaw('LOWER(name) = ?', [strtolower($name)])
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'This service type already exists.',
                'errors' => ['name' => ['This service type already exists.']],
            ], 422);
        }

        $lookup = InventoryLookup::query()->create([
            'tenant_id' => $tenantId,
            'lookup_type' => InventoryLookup::TYPE_SERVICE_TYPE,
            'name' => $name,
            'code' => $request->input('code') ?: strtolower(str_replace(' ', '_', $name)),
            'is_active' => $request->boolean('is_active', true),
            'sort_order' => (int) ($request->input('sort_order') ?? 99),
        ]);

        return response()->json($lookup, 201);
    }

    public function updateServiceType(Request $request, int $id)
    {
        $lookup = InventoryLookup::query()
            ->where('lookup_type', InventoryLookup::TYPE_SERVICE_TYPE)
            ->findOrFail($id);

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'code' => 'nullable|string|max:50',
            'is_active' => 'nullable|boolean',
            'sort_order' => 'nullable|integer|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $payload = $request->only(['name', 'code', 'sort_order']);
        if ($request->has('is_active')) {
            $payload['is_active'] = $request->boolean('is_active');
        }
        $lookup->update($payload);

        return response()->json($lookup);
    }

    public function destroyServiceType(int $id)
    {
        $lookup = InventoryLookup::query()
            ->where('lookup_type', InventoryLookup::TYPE_SERVICE_TYPE)
            ->findOrFail($id);
        $lookup->delete();

        return response()->noContent();
    }
}
