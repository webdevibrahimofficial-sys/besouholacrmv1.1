<?php

namespace App\Http\Controllers;

use App\Models\ItemCategory;
use App\Models\CrmSetting;
use App\Services\GeneralInventory\GeneralInventoryItemTypeService;
use App\Support\StartCodeGenerator;
use App\Traits\InventoryDeleteAuthorization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ItemCategoryController extends Controller
{
    use InventoryDeleteAuthorization;

    public function __construct(
        private readonly GeneralInventoryItemTypeService $itemTyping,
    ) {
    }

    public function index()
    {
        return ItemCategory::withCount('items')->latest()->get();
    }

    public function store(Request $request)
    {
        $payload = $this->validatedCategoryPayload($request);
        if ($payload instanceof \Illuminate\Http\JsonResponse) {
            return $payload;
        }

        $data = $payload;
        if (empty($data['code'])) {
            $settings = CrmSetting::resolved();
            $data['code'] = StartCodeGenerator::next(
                ItemCategory::query()->whereNotNull('code')->pluck('code'),
                (string) ($settings['startCategoryCode'] ?? 'CAT-0001'),
                'CAT-'
            );
        }

        $category = ItemCategory::create($data);

        return response()->json($category, 201);
    }

    public function update(Request $request, $id)
    {
        $category = ItemCategory::findOrFail($id);

        $payload = $this->validatedCategoryPayload($request, $category);
        if ($payload instanceof \Illuminate\Http\JsonResponse) {
            return $payload;
        }

        $category->update($payload);

        return response()->json($category);
    }

    public function destroy(Request $request, $id)
    {
        if ($resp = $this->authorizeInventoryDelete($request, 'general')) {
            return $resp;
        }
        $category = ItemCategory::withCount('items')->findOrFail($id);

        if ($category->items_count > 0) {
            return response()->json([
                'message' => 'This category is linked to items. Delete or move the linked items first.',
                'code' => 'category_has_items',
                'category_id' => $category->id,
                'category_name' => $category->name,
                'items_count' => $category->items_count,
            ], 409);
        }

        $category->delete();
        return response()->noContent();
    }

    /**
     * @return array<string,mixed>|\Illuminate\Http\JsonResponse
     */
    private function validatedCategoryPayload(Request $request, ?ItemCategory $existing = null)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:50',
            'applies_to' => 'nullable|string',
            'category_type' => 'nullable|string',
            'type' => 'nullable|string',
            'status' => 'nullable|string|in:Active,Inactive',
            'parent' => 'nullable|string',
            'description' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $categoryType = $this->itemTyping->resolveCategoryTypeFromInput($request->all());
        if (! $categoryType) {
            return response()->json([
                'message' => 'Category Type is required and must be Products or Services.',
                'errors' => [
                    'applies_to' => ['Category Type is required and must be Products or Services.'],
                    'category_type' => ['Category Type is required and must be Products or Services.'],
                ],
            ], 422);
        }

        $businessType = $this->itemTyping->businessTypeFromCategoryType($categoryType);
        $existingMeta = is_array($existing?->meta_data) ? $existing->meta_data : [];

        $payload = [
            'name' => $request->input('name'),
            'applies_to' => $categoryType,
            'status' => $request->input('status', $existing?->status ?: 'Active'),
            'parent' => $request->input('parent', $existing?->parent),
            'description' => $request->input('description'),
            'meta_data' => $this->itemTyping->withBusinessTypeMeta(
                array_replace_recursive($existingMeta, is_array($request->input('meta_data')) ? $request->input('meta_data') : []),
                $businessType,
                null,
                $categoryType
            ),
        ];

        if ($request->filled('code')) {
            $payload['code'] = $request->input('code');
        } elseif (! $existing) {
            $payload['code'] = null;
        }

        return $payload;
    }
}
