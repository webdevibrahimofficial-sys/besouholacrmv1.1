<?php

namespace App\Http\Controllers;

use App\Models\Item;
use App\Models\ItemCategory;
use App\Models\CrmSetting;
use App\Models\Entity;
use App\Models\FieldValue;
use App\Models\Lead;
use App\Models\User;
use App\Notifications\SystemNotification;
use App\Services\GeneralInventory\GeneralInventoryItemCatalogService;
use App\Services\GeneralInventory\GeneralInventoryItemTypeService;
use App\Services\GeneralInventory\InventoryLookupService;
use App\Support\StartCodeGenerator;
use App\Traits\InventoryDeleteAuthorization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Rule;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\UploadedFile;

class ItemController extends Controller
{
    use InventoryDeleteAuthorization;

    public function __construct(
        private readonly GeneralInventoryItemTypeService $itemTyping,
        private readonly GeneralInventoryItemCatalogService $catalog,
        private readonly InventoryLookupService $lookups,
    ) {
    }

    protected array $allowedItemTypes = [
        'Fixed', 'Per Unit',
        'One-time', 'Subscription', 'Monthly', 'Quarterly', 'Semi-annual', 'Semi Annually', 'Annually',
    ];
    protected array $allowedQuantityTypes = ['Piece', 'Box', 'Set', 'Meter', 'Kg', 'Hour', 'Liter', 'Other'];
    protected array $allowedQuantityTypeInputs = [
        'Piece', 'Box', 'Set', 'Meter', 'Kg', 'Hour', 'Liter', 'Other',
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

        $this->deleteStoredItemImage($item->image);
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

        $settings = CrmSetting::resolved();

        return StartCodeGenerator::next(
            $query->whereNotNull('code')->pluck('code'),
            (string) ($settings['startItemCode'] ?? 'ITM-0001'),
            'ITM-'
        );
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
        $data['unit'] = $this->catalog->normalizeUnitOfMeasure($data['unit'] ?? null);

        return $data;
    }

    private function assertUniqueItemCode(?int $tenantId, ?string $code, ?int $ignoreId = null): void
    {
        $code = trim((string) $code);
        if ($code === '') {
            return;
        }

        $query = Item::query()->where('code', $code);
        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }
        if ($ignoreId) {
            $query->where('id', '!=', $ignoreId);
        }

        if ($query->exists()) {
            throw ValidationException::withMessages([
                'code' => 'Item Code must be unique within this inventory.',
            ]);
        }
    }

    private function resolveCategoryForBusinessRules(?int $categoryId): ?ItemCategory
    {
        if (! $categoryId) {
            return null;
        }

        return ItemCategory::query()->find($categoryId);
    }

    /**
     * @param  array<string,mixed>  $input
     */
    private function validateBusinessTypeRules(array $input, ?ItemCategory $category, bool $isCreate = true): void
    {
        $this->catalog->assertBusinessRules($input, $category, $isCreate);
    }

    /**
     * @param  array<int,mixed>  $addons
     * @return list<array{tenant_id:mixed,name:string,quantity:int,price:float,period:?string}>
     */
    private function mapAddonPayloads(array $addons, mixed $tenantId, string $businessType): array
    {
        $isService = $businessType === GeneralInventoryItemTypeService::BUSINESS_TYPE_SERVICE;

        return collect($addons)
            ->filter(fn ($addon) => filled($addon['name'] ?? null))
            ->map(function ($addon) use ($tenantId, $isService) {
                $period = trim((string) ($addon['period'] ?? ''));

                return [
                    'tenant_id' => $tenantId,
                    'name' => trim((string) ($addon['name'] ?? '')),
                    'quantity' => $isService ? 1 : max(1, (int) ($addon['quantity'] ?? 1)),
                    'price' => (float) ($addon['price'] ?? 0),
                    'period' => $isService && $period !== '' ? $period : null,
                ];
            })
            ->values()
            ->all();
    }

    private function rememberServiceTypeLookup(?int $tenantId, string $businessType, array $data): void
    {
        if ($businessType !== GeneralInventoryItemTypeService::BUSINESS_TYPE_SERVICE) {
            return;
        }

        $name = trim((string) ($data['service_type'] ?? ''));
        if ($name === '') {
            return;
        }

        try {
            $this->lookups->rememberServiceType($tenantId, $name);
        } catch (\Throwable) {
            // Item save already succeeded; growing the lookup list is optional.
        }
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $query = Item::with(['customFieldValues.field', 'addons', 'category'])->latest();

        // Ensure we only retrieve items for the current user's tenant
        if ($user && $user->tenant_id) {
            $query->where('tenant_id', $user->tenant_id);
        }

        $this->catalog->applyListFilters($query, $request->all());

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
        $itemCode = $this->catalog->resolveItemCode($request->all()) ?: $this->nextItemCode($tenantId);

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'code' => 'nullable|string|max:255',
            'item_code' => 'nullable|string|max:255',
            'sku' => 'nullable|string|max:255',
            'barcode' => 'nullable|string|max:255',
            'quantity' => 'nullable|integer',
            'reserved_quantity' => 'nullable|integer',
            'sold_quantity' => 'nullable|integer',
            'min_alert' => 'nullable|integer',
            'warehouse' => 'nullable|string',
            'category' => 'nullable|string',
            'category_id' => 'required|exists:item_categories,id',
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
            'service_type' => 'nullable|string|max:255',
            'serviceType' => 'nullable|string|max:255',
            'allow_discount' => 'nullable|boolean',
            'maxDiscount' => 'nullable|numeric',
            'addons' => 'nullable|array',
            'addons.*.name' => 'required_with:addons|string|max:255',
            'addons.*.quantity' => 'nullable|integer|min:1',
            'addons.*.price' => 'nullable|numeric|min:0',
            'addons.*.period' => 'nullable|string|max:255',
            'image' => 'nullable',
            'remove_image' => 'nullable|boolean',
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
            $category = $this->resolveCategoryForBusinessRules($request->filled('category_id') ? (int) $request->input('category_id') : null);
            $this->validateBusinessTypeRules($request->all() + ['code' => $itemCode], $category, true);
            $this->assertUniqueItemCode($tenantId, $itemCode);

            // Handle mapping sku to code if needed
            $data = $request->only([
                'name', 'quantity', 'reserved_quantity', 'sold_quantity', 'min_alert', 
                'warehouse', 'family', 'category', 'category_id', 'group', 'brand', 'supplier', 'price', 'cost',
                'type', 'item_type', 'status', 'unit', 'description'
            ]);
            $data['code'] = $itemCode;
            
            // Map camelCase to snake_case, provide defaults for optional fields to avoid NULL violation
            $data['pricing_type'] = $request->input('pricingType') ?: 'Fixed';
            $data['billing_cycle'] = $request->input('billingCycle') ?: $request->input('billing_cycle') ?: 'Monthly';
            $data['allow_discount'] = $request->boolean('allowDiscount');
            $maxDiscount = $request->input('maxDiscount');
            if ($maxDiscount !== null && $maxDiscount !== '') {
                $data['max_discount'] = $maxDiscount;
            }
            $data = $this->normalizeQuantityTypeForItemType($data);
            $businessType = $this->itemTyping->businessTypeFromCategory($category);
            $data['type'] = $this->itemTyping->normalizeAppliesTo($category?->applies_to);
            $data = array_merge($data, $this->catalog->catalogAttributes($request->all() + ['code' => $itemCode], $businessType));
            if (! array_key_exists('min_alert', $data) || $data['min_alert'] === null || $data['min_alert'] === '') {
                $data['min_alert'] = 0;
            }
            $data['meta_data'] = $this->itemTyping->withBusinessTypeMeta(
                is_array($request->input('meta_data')) ? $request->input('meta_data') : [],
                $businessType,
                $category
            );

            $imagePath = $this->persistItemImage($request);
            $this->applyItemImageToPayload($data, $imagePath);
            
            // Set tenant_id if not present
            if (!isset($data['tenant_id'])) {
                $user = $request->user();
                if ($user && $user->tenant_id) {
                    $data['tenant_id'] = $user->tenant_id;
                }
            }

            $item = Item::create($this->catalog->persistableAttributes($data));

            $addons = $this->mapAddonPayloads(
                $request->input('addons', []),
                $data['tenant_id'] ?? null,
                $businessType
            );

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
            $this->rememberServiceTypeLookup($tenantId, $businessType, $data);
            $this->notifyMinimumQuantityIfNeeded($item->fresh());
            return response()->json($item->load(['customFieldValues.field', 'addons', 'category']), 201);

        } catch (ValidationException $e) {
            DB::rollBack();
            return response()->json([
                'message' => collect($e->errors())->flatten()->first() ?: 'Item validation failed',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            DB::rollBack();
            \Illuminate\Support\Facades\Log::error('Error creating item: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to create item', 'error' => $e->getMessage()], 500);
        }
    }

    public function show($id)
    {
        return Item::with(['customFieldValues.field', 'addons', 'category'])->findOrFail($id);
    }

    public function update(Request $request, $id)
    {
        try {
            $item = Item::findOrFail($id);
            $tenantId = $request->user()?->tenant_id;
            $oldQuantity = (int) ($item->quantity ?? 0);
            $oldMinimum = (int) ($item->min_alert ?? 0);
            
            $validator = Validator::make($request->all(), [
                'name' => 'sometimes|required|string|max:255',
                'code' => 'nullable|string|max:255',
                'item_code' => 'nullable|string|max:255',
                'sku' => 'nullable|string|max:255',
                'barcode' => 'nullable|string|max:255',
                'quantity' => 'nullable|integer',
                'reserved_quantity' => 'nullable|integer',
                'sold_quantity' => 'nullable|integer',
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
                'service_type' => 'nullable|string|max:255',
                'serviceType' => 'nullable|string|max:255',
                'allowDiscount' => 'nullable|boolean',
                'maxDiscount' => 'nullable|numeric',
                'addons' => 'nullable|array',
                'addons.*.name' => 'required_with:addons|string|max:255',
                'addons.*.quantity' => 'nullable|integer|min:1',
                'addons.*.price' => 'nullable|numeric|min:0',
                'addons.*.period' => 'nullable|string|max:255',
                'image' => 'nullable',
                'remove_image' => 'nullable|boolean',
            ]);

            if ($validator->fails()) {
                return response()->json(['errors' => $validator->errors()], 422);
            }

            DB::beginTransaction();
            $categoryId = array_key_exists('category_id', $request->all())
                ? ($request->filled('category_id') ? (int) $request->input('category_id') : null)
                : (int) ($item->category_id ?? 0);
            $category = $this->resolveCategoryForBusinessRules($categoryId ?: null);
            $this->validateBusinessTypeRules(array_merge([
                'name' => $item->name,
                'price' => $item->price,
                'quantity' => $item->quantity,
                'min_alert' => $item->min_alert,
                'billing_cycle' => $item->billing_cycle,
                'brand' => $item->brand,
                'service_type' => $item->service_type,
                'code' => $item->code,
            ], $request->all()), $category, false);

            $nextCode = $this->catalog->resolveItemCode($request->all(), $item->code);
            $this->assertUniqueItemCode($tenantId, $nextCode, (int) $item->id);

            $data = $request->only([
                'name', 'quantity', 'reserved_quantity', 'sold_quantity', 'min_alert', 
                'warehouse', 'family', 'category', 'category_id', 'group', 'brand', 'supplier', 'price', 'cost',
                'type', 'item_type', 'status', 'unit', 'description'
            ]);

            // Map camelCase to snake_case, handle nulls by defaulting if necessary (since columns are not nullable)
            if ($request->has('pricingType')) $data['pricing_type'] = $request->input('pricingType') ?: 'Fixed';
            if ($request->has('billingCycle') || $request->has('billing_cycle') || $request->has('service_billing_type')) {
                $data['billing_cycle'] = $request->input('billingCycle') ?: $request->input('billing_cycle') ?: $request->input('service_billing_type');
            }
            if ($request->has('allowDiscount')) $data['allow_discount'] = $request->boolean('allowDiscount');
            if ($request->has('maxDiscount')) {
                $maxDiscount = $request->input('maxDiscount');
                $data['max_discount'] = ($maxDiscount === '' || $maxDiscount === null) ? null : $maxDiscount;
            }
            if (!array_key_exists('item_type', $data)) $data['item_type'] = $item->item_type;
            $data = $this->normalizeQuantityTypeForItemType($data);
            $businessType = $this->itemTyping->businessTypeFromCategory($category);
            $data['type'] = $this->itemTyping->normalizeAppliesTo($category?->applies_to);
            $data = array_merge($data, $this->catalog->catalogAttributes($request->all(), $businessType, $item->code));
            if (array_key_exists('min_alert', $data) && ($data['min_alert'] === null || $data['min_alert'] === '')) {
                $data['min_alert'] = 0;
            }
            $existingMeta = is_array($item->meta_data) ? $item->meta_data : [];
            $data['meta_data'] = $this->itemTyping->withBusinessTypeMeta(
                array_replace_recursive($existingMeta, is_array($request->input('meta_data')) ? $request->input('meta_data') : []),
                $businessType,
                $category
            );

            $existingImage = $item->image ?: data_get($item->meta_data, 'general_inventory.image');
            $imagePath = $this->persistItemImage($request, is_string($existingImage) ? $existingImage : null);
            $this->applyItemImageToPayload($data, $imagePath);

            $item->update($this->catalog->persistableAttributes($data));

            if ($request->has('addons')) {
                $addons = $this->mapAddonPayloads(
                    $request->input('addons', []),
                    $item->tenant_id,
                    $businessType
                );

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
            $this->rememberServiceTypeLookup($tenantId, $businessType, $data);
            $this->notifyMinimumQuantityIfNeeded($item->fresh(), $oldQuantity, $oldMinimum);
            return response()->json($item->load(['customFieldValues.field', 'addons']));
        } catch (ValidationException $e) {
            DB::rollBack();
            return response()->json([
                'message' => collect($e->errors())->flatten()->first() ?: 'Item validation failed',
                'errors' => $e->errors(),
            ], 422);
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

    private function applyItemImageToPayload(array &$data, ?string $imagePath): void
    {
        if ($imagePath === null) {
            return;
        }

        $data['image'] = $imagePath === '' ? null : $imagePath;
        $meta = is_array($data['meta_data'] ?? null) ? $data['meta_data'] : [];
        $general = is_array($meta['general_inventory'] ?? null) ? $meta['general_inventory'] : [];
        if ($imagePath === '') {
            unset($general['image']);
        } else {
            $general['image'] = $imagePath;
        }
        $meta['general_inventory'] = $general;
        $data['meta_data'] = $meta;
    }

    private function persistItemImage(Request $request, ?string $existingPath = null): ?string
    {
        if ($request->boolean('remove_image')) {
            $this->deleteStoredItemImage($existingPath);

            return '';
        }

        if ($request->hasFile('image')) {
            $file = $request->file('image');
            if (! $file instanceof UploadedFile || ! $file->isValid()) {
                return null;
            }

            $this->deleteStoredItemImage($existingPath);

            return $file->store('items', 'public');
        }

        if (! $request->exists('image')) {
            return null;
        }

        $raw = $request->input('image');
        if (! is_string($raw) || trim($raw) === '') {
            $this->deleteStoredItemImage($existingPath);

            return '';
        }

        $raw = trim($raw);
        if (str_starts_with($raw, 'data:image')) {
            $stored = $this->storeItemImageFromDataUrl($raw);
            if ($stored) {
                $this->deleteStoredItemImage($existingPath);
            }

            return $stored ?: null;
        }

        return $this->normalizeStoredItemImagePath($raw) ?: $existingPath;
    }

    private function storeItemImageFromDataUrl(string $dataUrl): ?string
    {
        if (! preg_match('/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/', $dataUrl, $matches)) {
            return null;
        }

        $extension = strtolower($matches[1]);
        if ($extension === 'jpeg') {
            $extension = 'jpg';
        }
        if (! in_array($extension, ['jpg', 'png', 'gif', 'webp', 'svg+xml', 'svg'], true)) {
            $extension = 'png';
        }
        if ($extension === 'svg+xml') {
            $extension = 'svg';
        }

        $binary = base64_decode($matches[2], true);
        if ($binary === false || $binary === '') {
            return null;
        }

        $path = 'items/'.Str::uuid().'.'.$extension;
        Storage::disk('public')->put($path, $binary);

        return $path;
    }

    private function normalizeStoredItemImagePath(string $value): ?string
    {
        if (str_starts_with($value, 'data:')) {
            return null;
        }

        $path = $value;
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            $parts = parse_url($path);
            $path = (string) ($parts['path'] ?? '');
        }

        $path = ltrim($path, '/');
        if (str_starts_with($path, 'storage/')) {
            $path = substr($path, strlen('storage/'));
        }
        if (str_starts_with($path, 'api/public-files/')) {
            $path = substr($path, strlen('api/public-files/'));
        }

        $path = ltrim($path, '/');
        if ($path === '' || str_contains($path, '..')) {
            return null;
        }

        return $path;
    }

    private function deleteStoredItemImage(?string $path): void
    {
        $normalized = $path ? $this->normalizeStoredItemImagePath($path) : null;
        if (! $normalized) {
            return;
        }

        try {
            if (Storage::disk('public')->exists($normalized)) {
                Storage::disk('public')->delete($normalized);
            }
        } catch (\Throwable) {
            // Image cleanup is best-effort.
        }
    }
}
