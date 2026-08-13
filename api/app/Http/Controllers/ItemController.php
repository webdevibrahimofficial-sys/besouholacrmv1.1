<?php

namespace App\Http\Controllers;

use App\Models\Item;
use App\Models\Entity;
use App\Models\FieldValue;
use App\Models\Lead;
use App\Models\User;
use App\Notifications\SystemNotification;
use App\Traits\InventoryDeleteAuthorization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Http\Exceptions\HttpResponseException;

class ItemController extends Controller
{
    use InventoryDeleteAuthorization;

    protected array $allowedItemTypes = ['Fixed', 'Per Unit', 'Monthly', 'Semi Annually', 'Annually'];
    protected array $allowedQuantityTypes = ['Piece', 'Box', 'Kg', 'Liter', 'Meter', 'Hour'];
    protected array $allowedQuantityTypeInputs = [
        'Piece', 'Box', 'Kg', 'Liter', 'Meter', 'Hour',
        'Per Unit', 'pcs', 'pc', 'kilogram', 'kilograms', 'litre', 'l', 'metre', 'm', 'hr', 'h',
    ];

    protected function tenantScopedItemQuery(Request $request)
    {
        $query = Item::query();
        $tenantId = $request->user()?->tenant_id;

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        return $query;
    }

    protected function tenantScopedLeadQuery(Request $request)
    {
        $query = Lead::query();
        $tenantId = $request->user()?->tenant_id;

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        return $query;
    }

    protected function linkedLeadsCount(Request $request, int $itemId): int
    {
        return (clone $this->tenantScopedLeadQuery($request))
            ->where('item_id', $itemId)
            ->count();
    }

    protected function resolveReplacementItem(Request $request, ?int $replacementItemId, array $deletedItemIds = []): ?Item
    {
        if (!$replacementItemId) {
            return null;
        }

        if (in_array($replacementItemId, $deletedItemIds, true)) {
            throw new HttpResponseException(response()->json([
                'message' => 'Replacement item cannot be one of the deleted items.',
                'code' => 'replacement_item_in_delete_set',
            ], 422));
        }

        return $this->tenantScopedItemQuery($request)
            ->where('id', $replacementItemId)
            ->firstOrFail();
    }

    protected function deleteItemWithBackendDecision(Request $request, Item $item, ?Item $replacementItem = null): array
    {
        $leadsCount = $this->linkedLeadsCount($request, (int) $item->id);

        if ($leadsCount > 0 && !$replacementItem) {
            return [
                'blocked' => true,
                'code' => 'item_has_leads',
                'message' => 'This item is linked to leads. Transfer the linked leads to another item before deleting it.',
                'item_id' => $item->id,
                'item_name' => $item->name,
                'leads_count' => $leadsCount,
            ];
        }

        $transferredLeads = 0;

        if ($leadsCount > 0 && $replacementItem) {
            $transferredLeads = (clone $this->tenantScopedLeadQuery($request))
                ->where('item_id', $item->id)
                ->update(['item_id' => $replacementItem->id]);
        }

        $item->delete();

        return [
            'blocked' => false,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'leads_count' => $leadsCount,
            'transferred_leads' => $transferredLeads,
        ];
    }

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

    protected function userHasCustomerModule(User $user): bool
    {
        if ($user->is_super_admin) {
            return true;
        }

        $role = strtolower(trim((string) ($user->role ?? $user->job_title ?? '')));
        if (in_array($role, ['admin', 'tenant admin', 'tenant-admin'], true)) {
            return true;
        }

        $meta = is_array($user->meta_data) ? $user->meta_data : [];
        $modulePermissions = $meta['module_permissions'] ?? [];
        if (!is_array($modulePermissions)) {
            return false;
        }

        foreach (['Customers', 'customers', 'Customer', 'customer'] as $key) {
            if (!array_key_exists($key, $modulePermissions)) {
                continue;
            }

            $permissions = $modulePermissions[$key];
            if ($permissions === true) {
                return true;
            }

            if (is_array($permissions) && count($permissions) > 0) {
                return true;
            }
        }

        return false;
    }

    protected function shouldNotifyMinimumQuantity(?int $oldQuantity, ?int $oldMinimum, Item $item): bool
    {
        $quantity = (int) ($item->quantity ?? 0);
        $minimum = (int) ($item->min_alert ?? 0);

        if ($minimum <= 0 || $quantity > $minimum) {
            return false;
        }

        if ($oldQuantity === null || $oldMinimum === null) {
            return true;
        }

        return $oldQuantity > $oldMinimum || $oldMinimum !== $minimum;
    }

    protected function notifyMinimumQuantityIfNeeded(Item $item, ?int $oldQuantity = null, ?int $oldMinimum = null): void
    {
        if (!$this->shouldNotifyMinimumQuantity($oldQuantity, $oldMinimum, $item)) {
            return;
        }

        try {
            $recipients = User::query()
                ->where('tenant_id', $item->tenant_id)
                ->where(function ($query) {
                    $query->where('status', 'Active')->orWhereNull('status');
                })
                ->get()
                ->filter(fn (User $user) => $this->userHasCustomerModule($user))
                ->values();

            if ($recipients->isEmpty()) {
                return;
            }

            $quantity = (int) ($item->quantity ?? 0);
            $minimum = (int) ($item->min_alert ?? 0);
            $title = 'Minimum quantity reached';
            $message = "Item {$item->name} reached the minimum quantity limit ({$quantity}/{$minimum}).";

            foreach ($recipients as $recipient) {
                $recipient->notify(new SystemNotification($title, $message, [
                    'module' => 'inventory',
                    'event' => 'minimum_quantity_reached',
                    'item_id' => $item->id,
                    'item_name' => $item->name,
                    'item_code' => $item->code ?? $item->sku,
                    'quantity' => $quantity,
                    'minimum_quantity' => $minimum,
                ]));
            }
        } catch (\Throwable $e) {
            Log::warning('Failed to send item minimum quantity notification', [
                'item_id' => $item->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    protected function normalizeQuantityTypeForItemType(array $data): array
    {
        if (($data['item_type'] ?? null) !== 'Per Unit') {
            $data['unit'] = 'Piece';
            return $data;
        }

        $normalized = strtolower(trim((string) ($data['unit'] ?? '')));
        $data['unit'] = match ($normalized) {
            'box' => 'Box',
            'kg', 'kilogram', 'kilograms' => 'Kg',
            'liter', 'litre', 'l' => 'Liter',
            'meter', 'metre', 'm' => 'Meter',
            'hour', 'hr', 'h' => 'Hour',
            default => 'Piece',
        };

        if (!in_array($data['unit'], $this->allowedQuantityTypes, true)) {
            $data['unit'] = 'Piece';
        }

        return $data;
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
            'unit' => ['nullable', 'string', Rule::in($this->allowedQuantityTypeInputs)],
            'type' => 'nullable|string',
            'item_type' => ['nullable', 'string', 'max:255', Rule::in($this->allowedItemTypes)],
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
            $data = $this->normalizeQuantityTypeForItemType($data);
            
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
            $this->notifyMinimumQuantityIfNeeded($item->fresh());
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
            $oldQuantity = (int) ($item->quantity ?? 0);
            $oldMinimum = (int) ($item->min_alert ?? 0);
            
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
                'unit' => ['nullable', 'string', Rule::in($this->allowedQuantityTypeInputs)],
                'type' => 'nullable|string',
                'item_type' => ['nullable', 'string', 'max:255', Rule::in($this->allowedItemTypes)],
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
            if (!array_key_exists('item_type', $data)) $data['item_type'] = $item->item_type;
            $data = $this->normalizeQuantityTypeForItemType($data);

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
            $this->notifyMinimumQuantityIfNeeded($item->fresh(), $oldQuantity, $oldMinimum);
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

        $item = $this->tenantScopedItemQuery($request)->findOrFail($id);
        $replacementItemId = $request->filled('replacement_item_id') ? (int) $request->input('replacement_item_id') : null;
        $replacementItem = $this->resolveReplacementItem($request, $replacementItemId, [(int) $item->id]);

        $result = DB::transaction(function () use ($request, $item, $replacementItem) {
            return $this->deleteItemWithBackendDecision($request, $item, $replacementItem);
        });

        if ($result['blocked']) {
            return response()->json($result, 409);
        }

        return response()->json(['message' => 'Item deleted', 'result' => $result]);
    }

    public function bulkDestroy(Request $request)
    {
        if ($resp = $this->authorizeInventoryDelete($request, 'general')) {
            return $resp;
        }

        $validator = Validator::make($request->all(), [
            'item_ids' => 'required|array|min:1',
            'item_ids.*' => 'integer',
            'replacement_item_id' => 'nullable|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $itemIds = collect($request->input('item_ids', []))
            ->map(fn ($id) => (int) $id)
            ->filter()
            ->unique()
            ->values()
            ->all();

        $items = $this->tenantScopedItemQuery($request)
            ->whereIn('id', $itemIds)
            ->get();

        if ($items->count() !== count($itemIds)) {
            return response()->json([
                'message' => 'One or more selected items were not found.',
                'code' => 'items_not_found',
            ], 404);
        }

        $replacementItemId = $request->filled('replacement_item_id') ? (int) $request->input('replacement_item_id') : null;
        $replacementItem = $this->resolveReplacementItem($request, $replacementItemId, $itemIds);

        if (!$replacementItem) {
            $blockers = $items
                ->map(fn ($item) => [
                    'blocked' => true,
                    'code' => 'item_has_leads',
                    'message' => 'This item is linked to leads. Transfer the linked leads to another item before deleting it.',
                    'item_id' => $item->id,
                    'item_name' => $item->name,
                    'leads_count' => $this->linkedLeadsCount($request, (int) $item->id),
                ])
                ->filter(fn ($item) => $item['leads_count'] > 0)
                ->values()
                ->all();

            if (!empty($blockers)) {
                return response()->json([
                    'message' => 'Some selected items are linked to leads. Transfer the linked leads to another item before deleting them.',
                    'code' => 'items_have_leads',
                    'blockers' => $blockers,
                ], 409);
            }
        }

        $results = [];

        DB::transaction(function () use ($request, $items, $replacementItem, &$results) {
            foreach ($items as $item) {
                $result = $this->deleteItemWithBackendDecision($request, $item, $replacementItem);
                $results[] = $result;
            }
        });

        return response()->json([
            'message' => 'Items deleted',
            'deleted_count' => count($results),
            'results' => $results,
        ]);
    }
}
