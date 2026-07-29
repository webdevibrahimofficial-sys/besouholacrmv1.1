<?php

namespace App\Http\Controllers;

use App\Models\Item;
use App\Models\Entity;
use App\Models\FieldValue;
use App\Traits\InventoryDeleteAuthorization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ItemController extends Controller
{
    use InventoryDeleteAuthorization;

    protected function nextItemCode(?int $tenantId): string
    {
        $query = Item::query();

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $codes = $query
            ->whereNotNull('code')
            ->pluck('code');

        $maxNum = 0;

        foreach ($codes as $code) {
            $normalized = strtolower(trim((string) $code));
            if (!str_starts_with($normalized, 'item-')) {
                continue;
            }

            $number = (int) substr($normalized, 5);
            if ($number > $maxNum) {
                $maxNum = $number;
            }
        }

        return 'item-' . str_pad((string) ($maxNum + 1), 3, '0', STR_PAD_LEFT);
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $query = Item::with(['customFieldValues.field', 'addons'])->latest();

        // Ensure we only retrieve items for the current user's tenant
        if ($user && $user->tenant_id) {
            $query->where('tenant_id', $user->tenant_id);
        }

        if ($request->has('all')) {
            return $query->get()->each->append(['addons_total_quantity', 'addons_total_price', 'total_price']);
        }

        $paginated = $query->paginate(10);
        $paginated->getCollection()->each->append(['addons_total_quantity', 'addons_total_price', 'total_price']);

        return $paginated;
    }

    public function store(Request $request)
    {
        $tenantId = $request->user()?->tenant_id;
        $sku = trim((string) $request->input('sku', ''));
        $sku = $sku === '' ? null : $sku;

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'sku' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('items', 'code')->where(fn ($query) => $query->where('tenant_id', $tenantId)),
            ],
            'quantity' => 'nullable|integer',
            'reserved_quantity' => 'nullable|integer',
            'min_alert' => 'nullable|integer',
            'warehouse' => 'nullable|string',
            'category' => 'nullable|string',
            'category_id' => 'nullable|exists:item_categories,id',
            'brand' => 'nullable|string',
            'supplier' => 'nullable|string',
            'price' => 'nullable|numeric',
            'cost' => 'nullable|numeric',
            'family' => 'nullable|string',
            'group' => 'nullable|string',
            'unit' => 'nullable|string',
            'type' => 'nullable|string',
            'item_type' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'pricing_type' => 'nullable|string',
            'billing_cycle' => 'nullable|string',
            'allow_discount' => 'nullable|boolean',
            'maxDiscount' => 'nullable|numeric',
            'addons' => 'nullable|array',
            'addons.*.name' => 'required_with:addons|string|max:255',
            'addons.*.quantity' => 'nullable|integer|min:1',
            'addons.*.price' => 'nullable|numeric|min:0',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Custom Fields Validation
        $entity = Entity::where('key', 'items')->first();
        if ($entity) {
            $customFields = $entity->fields;
            $customRules = [];
            foreach ($customFields as $field) {
                if ($field->required && $field->active) {
                    $customRules['custom_fields.' . $field->key] = 'required';
                }
            }
            if (!empty($customRules)) {
                $customValidator = Validator::make($request->all(), $customRules);
                if ($customValidator->fails()) {
                     return response()->json(['errors' => $customValidator->errors()], 422);
                }
            }
        }

        try {
            DB::beginTransaction();

            // Handle mapping sku to code if needed
            $data = $request->only([
                'name', 'quantity', 'reserved_quantity', 'min_alert', 
                'warehouse', 'family', 'category', 'category_id', 'group', 'brand', 'supplier', 'price', 'cost',
                'type', 'item_type', 'status', 'unit', 'description'
            ]);
            $data['code'] = $sku ?? $request->input('code') ?? $this->nextItemCode($tenantId);
            $data['sku'] = $data['code']; // Sync sku column
            
            // Map camelCase to snake_case, provide defaults for optional fields to avoid NULL violation
            $data['pricing_type'] = $request->input('pricingType') ?: 'Fixed';
            $data['billing_cycle'] = $request->input('billingCycle') ?: 'Monthly';
            $data['allow_discount'] = $request->boolean('allowDiscount');
            $data['max_discount'] = $request->input('maxDiscount');
            
            // Set tenant_id if not present
            if (!isset($data['tenant_id'])) {
                $user = $request->user();
                if ($user && $user->tenant_id) {
                    $data['tenant_id'] = $user->tenant_id;
                }
            }

            $item = Item::create($data);

            $addons = collect($request->input('addons', []))
                ->filter(fn ($addon) => filled($addon['name'] ?? null))
                ->map(function ($addon) use ($data) {
                    return [
                        'tenant_id' => $data['tenant_id'] ?? null,
                        'name' => trim((string) ($addon['name'] ?? '')),
                        'quantity' => max(1, (int) ($addon['quantity'] ?? 1)),
                        'price' => (float) ($addon['price'] ?? 0),
                    ];
                })
                ->values()
                ->all();

            if (!empty($addons)) {
                $item->addons()->createMany($addons);
            }

            // Save Custom Fields
            if ($request->has('custom_fields') && $entity) {
                $fieldsMap = $entity->fields->pluck('id', 'key');
                foreach ($request->input('custom_fields') as $key => $value) {
                    if (isset($fieldsMap[$key])) {
                        FieldValue::create([
                            'field_id' => $fieldsMap[$key],
                            'record_id' => $item->id,
                            'value' => $value,
                        ]);
                    }
                }
            }

            DB::commit();
            return response()->json($item->load(['customFieldValues.field', 'addons']), 201);

        } catch (\Exception $e) {
            DB::rollBack();
            \Illuminate\Support\Facades\Log::error('Error creating item: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to create item', 'error' => $e->getMessage()], 500);
        }
    }

    public function show($id)
    {
        return Item::with(['customFieldValues.field', 'addons'])->findOrFail($id);
    }

    public function update(Request $request, $id)
    {
        try {
            $item = Item::findOrFail($id);
            $tenantId = $request->user()?->tenant_id;
            $sku = trim((string) $request->input('sku', ''));
            $sku = $sku === '' ? null : $sku;
            
            $validator = Validator::make($request->all(), [
                'name' => 'sometimes|required|string|max:255',
                'sku' => [
                    'nullable',
                    'string',
                    'max:255',
                    Rule::unique('items', 'code')
                        ->ignore($item->id)
                        ->where(fn ($query) => $query->where('tenant_id', $tenantId)),
                ],
                'quantity' => 'nullable|integer',
                'reserved_quantity' => 'nullable|integer',
                'min_alert' => 'nullable|integer',
                'warehouse' => 'nullable|string',
                'category' => 'nullable|string',
                'category_id' => 'nullable|exists:item_categories,id',
                'brand' => 'nullable|string',
                'supplier' => 'nullable|string',
                'price' => 'nullable|numeric',
                'cost' => 'nullable|numeric',
                'family' => 'nullable|string',
                'group' => 'nullable|string',
                'unit' => 'nullable|string',
                'type' => 'nullable|string',
                'item_type' => 'nullable|string|max:255',
                'description' => 'nullable|string',
                'pricingType' => 'nullable|string',
                'billingCycle' => 'nullable|string',
                'allowDiscount' => 'nullable|boolean',
                'maxDiscount' => 'nullable|numeric',
                'addons' => 'nullable|array',
                'addons.*.name' => 'required_with:addons|string|max:255',
                'addons.*.quantity' => 'nullable|integer|min:1',
                'addons.*.price' => 'nullable|numeric|min:0',
            ]);

            if ($validator->fails()) {
                return response()->json(['errors' => $validator->errors()], 422);
            }

            DB::beginTransaction();

            $data = $request->only([
                'name', 'quantity', 'reserved_quantity', 'min_alert', 
                'warehouse', 'family', 'category', 'category_id', 'group', 'brand', 'supplier', 'price', 'cost',
                'type', 'item_type', 'status', 'unit', 'description'
            ]);
            
            if ($request->has('sku')) {
                if ($sku !== null) {
                    $data['code'] = $sku;
                    $data['sku'] = $sku;
                }
            }

            // Map camelCase to snake_case, handle nulls by defaulting if necessary (since columns are not nullable)
            if ($request->has('pricingType')) $data['pricing_type'] = $request->input('pricingType') ?: 'Fixed';
            if ($request->has('billingCycle')) $data['billing_cycle'] = $request->input('billingCycle') ?: 'Monthly';
            if ($request->has('allowDiscount')) $data['allow_discount'] = $request->boolean('allowDiscount');
            if ($request->has('maxDiscount')) $data['max_discount'] = $request->input('maxDiscount');

            $item->update($data);

            if ($request->has('addons')) {
                $addons = collect($request->input('addons', []))
                    ->filter(fn ($addon) => filled($addon['name'] ?? null))
                    ->map(function ($addon) use ($item) {
                        return [
                            'tenant_id' => $item->tenant_id,
                            'name' => trim((string) ($addon['name'] ?? '')),
                            'quantity' => max(1, (int) ($addon['quantity'] ?? 1)),
                            'price' => (float) ($addon['price'] ?? 0),
                        ];
                    })
                    ->values()
                    ->all();

                $item->addons()->delete();

                if (!empty($addons)) {
                    $item->addons()->createMany($addons);
                }
            }
            
            // Update Custom Fields
            $entity = Entity::where('key', 'items')->first();
            if ($request->has('custom_fields') && $entity) {
                $fieldsMap = $entity->fields->pluck('id', 'key');
                foreach ($request->input('custom_fields') as $key => $value) {
                    if (isset($fieldsMap[$key])) {
                        FieldValue::updateOrCreate(
                            ['field_id' => $fieldsMap[$key], 'record_id' => $item->id],
                            ['value' => $value]
                        );
                    }
                }
            }
            
            DB::commit();
            return response()->json($item->load(['customFieldValues.field', 'addons']));
        } catch (\Exception $e) {
            DB::rollBack();
            \Illuminate\Support\Facades\Log::error('Error updating item: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to update item', 'error' => $e->getMessage()], 500);
        }
    }

    public function destroy(Request $request, $id)
    {
        if ($resp = $this->authorizeInventoryDelete($request, 'general')) {
            return $resp;
        }
        Item::findOrFail($id)->delete();
        return response()->json(['message' => 'Item deleted']);
    }
}
