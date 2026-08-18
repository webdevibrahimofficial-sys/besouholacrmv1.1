<?php

namespace App\Services\GeneralInventory;

use App\Models\Item;
use App\Models\ItemCategory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Validation\ValidationException;

final class GeneralInventoryItemCatalogService
{
    public const BILLING_ONE_TIME = 'One-time';
    public const BILLING_SUBSCRIPTION = 'Subscription';
    public const BILLING_MONTHLY = 'Monthly';
    public const BILLING_QUARTERLY = 'Quarterly';
    public const BILLING_SEMI_ANNUAL = 'Semi-annual';
    public const BILLING_ANNUALLY = 'Annually';

    /**
     * @return list<string>
     */
    public function serviceBillingTypes(): array
    {
        return [
            self::BILLING_ONE_TIME,
            self::BILLING_SUBSCRIPTION,
            self::BILLING_MONTHLY,
            self::BILLING_QUARTERLY,
            self::BILLING_SEMI_ANNUAL,
            self::BILLING_ANNUALLY,
        ];
    }

    /**
     * @return list<string>
     */
    public function unitsOfMeasure(): array
    {
        return ['Piece', 'Box', 'Set', 'Meter', 'Kg', 'Hour', 'Liter', 'Other'];
    }

    public function normalizeUnitOfMeasure(?string $unit): string
    {
        $normalized = strtolower(trim((string) $unit));

        return match ($normalized) {
            'box' => 'Box',
            'set' => 'Set',
            'meter', 'metre', 'm' => 'Meter',
            'kg', 'kilogram', 'kilograms' => 'Kg',
            'hour', 'hr', 'h' => 'Hour',
            'liter', 'litre', 'l' => 'Liter',
            'other' => 'Other',
            default => 'Piece',
        };
    }

    public function normalizeServiceBillingType(?string $value): ?string
    {
        $normalized = strtolower(trim((string) $value));
        if ($normalized === '') {
            return null;
        }

        return match ($normalized) {
            'one-time', 'onetime', 'one time', 'fixed' => self::BILLING_ONE_TIME,
            'subscription' => self::BILLING_SUBSCRIPTION,
            'monthly' => self::BILLING_MONTHLY,
            'quarterly' => self::BILLING_QUARTERLY,
            'semi-annual', 'semi annual', 'semi-annually', 'semi annually' => self::BILLING_SEMI_ANNUAL,
            'annually', 'annual', 'yearly' => self::BILLING_ANNUALLY,
            default => null,
        };
    }

    public function isRecurringBillingType(?string $value): bool
    {
        $type = $this->normalizeServiceBillingType($value);

        return $type !== null && $type !== self::BILLING_ONE_TIME;
    }

    public function resolveItemCode(array $input, ?string $existingCode = null): ?string
    {
        foreach (['code', 'item_code', 'itemCode'] as $field) {
            $value = trim((string) ($input[$field] ?? ''));
            if ($value !== '') {
                return $value;
            }
        }

        return $existingCode ?: null;
    }

    public function resolveBarcode(array $input, ?string $existing = null): ?string
    {
        foreach (['barcode', 'sku'] as $field) {
            $value = trim((string) ($input[$field] ?? ''));
            if ($value !== '') {
                return $value;
            }
        }

        return $existing;
    }

    /**
     * @param  array<string,mixed>  $input
     */
    public function assertBusinessRules(array $input, ?ItemCategory $category, bool $isCreate = true): void
    {
        if (! $category) {
            throw ValidationException::withMessages([
                'category_id' => 'Category is required so the item form can follow Products or Services.',
            ]);
        }

        $businessType = app(GeneralInventoryItemTypeService::class)->businessTypeFromCategory($category);
        $name = trim((string) ($input['name'] ?? ''));
        $price = $input['price'] ?? null;
        $quantity = $input['quantity'] ?? null;
        $brand = trim((string) ($input['brand'] ?? $input['brand_name'] ?? $input['brandName'] ?? ''));
        $serviceType = trim((string) ($input['service_type'] ?? $input['serviceType'] ?? ''));
        $billingCycle = $this->normalizeServiceBillingType($input['billingCycle'] ?? $input['billing_cycle'] ?? $input['service_billing_type'] ?? null);

        if ($businessType === GeneralInventoryItemTypeService::BUSINESS_TYPE_PRODUCT) {
            $errors = [];
            if ($isCreate && $brand === '') {
                $errors['brand'] = 'Product items require a brand name.';
            }
            if ($isCreate && $name === '') {
                $errors['name'] = 'Product items require an item name.';
            }
            if ($isCreate && ($quantity === null || $quantity === '')) {
                $errors['quantity'] = 'Product items require quantity.';
            }
            if ($isCreate && ($price === null || $price === '')) {
                $errors['price'] = 'Product items require unit price.';
            }
            if ($errors !== []) {
                throw ValidationException::withMessages($errors);
            }

            return;
        }

        $errors = [];
        if ($isCreate && $name === '') {
            $errors['name'] = 'Service items require a service name.';
        }
        if ($isCreate && $serviceType === '') {
            $errors['service_type'] = 'Service items require a service type.';
        }
        if ($price === null || $price === '') {
            $errors['price'] = 'Service items require a service amount.';
        }
        if ($billingCycle === null) {
            $errors['billingCycle'] = 'Service items require a service billing type.';
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * @param  array<string,mixed>  $input
     * @return array<string,mixed>
     */
    public function catalogAttributes(array $input, string $businessType, ?string $existingCode = null): array
    {
        $code = $this->resolveItemCode($input, $existingCode);
        $barcode = $this->resolveBarcode($input);
        $billingType = $this->normalizeServiceBillingType($input['billingCycle'] ?? $input['billing_cycle'] ?? $input['service_billing_type'] ?? null);
        $unit = $this->normalizeUnitOfMeasure($input['unit'] ?? null);

        $attributes = [
            'model' => $this->nullableString($input['model'] ?? null),
            'barcode' => $barcode,
            'sku' => $barcode,
            'tax_rate' => $this->nullableDecimal($input['tax_rate'] ?? $input['taxRate'] ?? null),
            'tax_included' => $this->toBoolean($input['tax_included'] ?? $input['taxIncluded'] ?? false),
            'notes' => $this->nullableString($input['notes'] ?? null),
            'warehouse' => $this->nullableString($input['warehouse'] ?? $input['location'] ?? null),
            'supplier' => $this->nullableString($input['supplier'] ?? $input['vendor'] ?? null),
            'unit' => $unit,
            'brand' => $this->nullableString($input['brand'] ?? $input['brand_name'] ?? $input['brandName'] ?? null),
            'service_type' => $this->nullableString($input['service_type'] ?? $input['serviceType'] ?? null),
            'service_duration' => $this->nullableString($input['service_duration'] ?? $input['serviceDuration'] ?? null),
            'service_start_date' => $this->nullableDate($input['service_start_date'] ?? $input['startDate'] ?? $input['start_date'] ?? null),
            'service_end_date' => $this->nullableDate($input['service_end_date'] ?? $input['endDate'] ?? $input['end_date'] ?? null),
            'renewal_required' => $this->toBoolean($input['renewal_required'] ?? $input['renewalRequired'] ?? false),
        ];

        if ($code) {
            $attributes['code'] = $code;
        }

        if (array_key_exists('min_alert', $input) || array_key_exists('minStock', $input)) {
            $rawMinimum = $input['min_alert'] ?? $input['minStock'] ?? 0;
            $attributes['min_alert'] = ($rawMinimum === null || $rawMinimum === '') ? 0 : (int) $rawMinimum;
        }

        if ($businessType === GeneralInventoryItemTypeService::BUSINESS_TYPE_SERVICE) {
            $attributes['quantity'] = (int) ($input['quantity'] ?? 0);
            $attributes['min_alert'] = (int) ($input['min_alert'] ?? $input['minStock'] ?? 0);
            if ($billingType) {
                $attributes['billing_cycle'] = $billingType;
                $attributes['item_type'] = $billingType;
            }
        }

        return array_filter($attributes, static fn ($value) => $value !== null);
    }

    /**
     * @param  array<string,mixed>  $attributes
     * @return array<string,mixed>
     */
    public function persistableAttributes(array $attributes): array
    {
        $item = new Item();
        $schema = $item->getConnection()->getSchemaBuilder();
        $table = $item->getTable();

        try {
            $columns = $schema->getColumnListing($table);
        } catch (\Throwable) {
            $columns = [];
        }

        if ($columns !== []) {
            return array_intersect_key($attributes, array_flip($columns));
        }

        $kept = [];
        foreach ($attributes as $column => $value) {
            try {
                if ($schema->hasColumn($table, $column)) {
                    $kept[$column] = $value;
                }
            } catch (\Throwable) {
                continue;
            }
        }

        return $kept;
    }

    private function nullableDecimal(mixed $value): ?float
    {
        if ($value === null || $value === '' || $value === false) {
            return null;
        }

        return is_numeric($value) ? (float) $value : null;
    }

    private function nullableDate(mixed $value): ?string
    {
        $text = trim((string) $value);
        if ($text === '' || strtolower($text) === 'null') {
            return null;
        }

        return $text;
    }

    /**
     * @param  array<string,mixed>  $input
     */
    public function applyListFilters(Builder $query, array $input): Builder
    {
        $this->applySearch($query, $input['search'] ?? $input['q'] ?? null);
        $this->applyName($query, $input['name'] ?? null);
        $this->applyBrand($query, $input['brand'] ?? null);
        $this->applyCode($query, $input['code'] ?? $input['item_code'] ?? $input['itemCode'] ?? null);
        $this->applyServiceType($query, $input['service_type'] ?? $input['serviceType'] ?? null);
        $this->applySku($query, $input['sku'] ?? $input['barcode'] ?? null);
        $this->applyStatus($query, $input['status'] ?? null);
        $this->applyCategoryName($query, $input['category'] ?? null);
        $this->applyCategoryType(
            $query,
            $input['type']
                ?? $input['category_type']
                ?? $input['categoryType']
                ?? $input['business_type']
                ?? $input['businessType']
                ?? null
        );
        $this->applyItemOrBillingType($query, $input['item_type'] ?? $input['itemType'] ?? null);
        $this->applyContains($query, 'model', $input['model'] ?? null);
        $this->applyContains($query, 'warehouse', $input['warehouse'] ?? null);
        $this->applyContains($query, 'supplier', $input['supplier'] ?? null);
        $this->applyContains($query, 'unit', $input['unit'] ?? null);
        $this->applyContains($query, 'service_duration', $input['service_duration'] ?? $input['serviceDuration'] ?? null);
        $this->applyRenewalRequired($query, $input['renewal_required'] ?? $input['renewalRequired'] ?? null);
        $this->applyDateOn($query, 'service_start_date', $input['start_date'] ?? $input['startDate'] ?? $input['service_start_date'] ?? null);
        $this->applyDateOn($query, 'service_end_date', $input['end_date'] ?? $input['endDate'] ?? $input['service_end_date'] ?? null);
        $this->applyCreatedAtFilter($query, $input);

        if ($this->toBoolean($input['low_stock'] ?? $input['lowStock'] ?? false)) {
            $this->applyLowStock($query);
        }

        return $query;
    }

    public function applySearch(Builder $query, ?string $search): Builder
    {
        $term = trim((string) $search);
        if ($term === '') {
            return $query;
        }

        return $query->where(function (Builder $inner) use ($term) {
            $like = '%'.$term.'%';
            $inner->where('name', 'like', $like)
                ->orWhere('code', 'like', $like)
                ->orWhere('brand', 'like', $like)
                ->orWhere('model', 'like', $like)
                ->orWhere('sku', 'like', $like)
                ->orWhere('barcode', 'like', $like);
        });
    }

    public function applyName(Builder $query, ?string $name): Builder
    {
        return $this->applyContains($query, 'name', $name);
    }

    public function applyBrand(Builder $query, ?string $brand): Builder
    {
        return $this->applyContains($query, 'brand', $brand);
    }

    public function applyCode(Builder $query, ?string $code): Builder
    {
        return $this->applyContains($query, 'code', $code);
    }

    public function applyServiceType(Builder $query, ?string $serviceType): Builder
    {
        $term = trim((string) $serviceType);
        if ($term === '') {
            return $query;
        }

        return $query->whereRaw('LOWER(TRIM(service_type)) = ?', [strtolower($term)]);
    }

    public function applySku(Builder $query, ?string $sku): Builder
    {
        $term = trim((string) $sku);
        if ($term === '') {
            return $query;
        }

        $like = '%'.$term.'%';

        return $query->where(function (Builder $inner) use ($like) {
            $inner->where('sku', 'like', $like)
                ->orWhere('barcode', 'like', $like);
        });
    }

    public function applyStatus(Builder $query, ?string $status): Builder
    {
        $term = trim((string) $status);
        if ($term === '') {
            return $query;
        }

        return $query->where('status', $term);
    }

    public function applyCategoryName(Builder $query, ?string $categoryName): Builder
    {
        $term = trim((string) $categoryName);
        if ($term === '') {
            return $query;
        }

        return $query->where(function (Builder $inner) use ($term) {
            $inner->where('category', $term)
                ->orWhereHas('category', function (Builder $category) use ($term) {
                    $category->where('name', $term);
                });
        });
    }

    public function applyCategoryType(Builder $query, ?string $type): Builder
    {
        $itemTyping = app(GeneralInventoryItemTypeService::class);
        $normalized = $itemTyping->normalizeCategoryType($type);
        if (! $normalized) {
            return $query;
        }

        $isService = $normalized === GeneralInventoryItemTypeService::CATEGORY_TYPE_SERVICES;
        $serviceValues = ['service', 'services', 'subscription', 'package'];
        $typeValues = $isService ? $serviceValues : ['product', 'products'];
        $businessType = $itemTyping->businessTypeFromCategoryType($normalized);
        $typePlaceholders = implode(',', array_fill(0, count($typeValues), '?'));

        return $query->where(function (Builder $outer) use ($isService, $serviceValues, $typeValues, $typePlaceholders, $businessType) {
            $outer->whereHas('category', function (Builder $category) use ($isService, $serviceValues) {
                if ($isService) {
                    $category->where(function (Builder $inner) use ($serviceValues) {
                        foreach ($serviceValues as $index => $value) {
                            $method = $index === 0 ? 'whereRaw' : 'orWhereRaw';
                            $inner->{$method}('LOWER(TRIM(applies_to)) = ?', [$value]);
                        }
                    });

                    return;
                }

                $placeholders = implode(',', array_fill(0, count($serviceValues), '?'));
                $category->where(function (Builder $inner) use ($placeholders, $serviceValues) {
                    $inner->whereNull('applies_to')
                        ->orWhereRaw('TRIM(applies_to) = ?', [''])
                        ->orWhereRaw('LOWER(TRIM(applies_to)) not in ('.$placeholders.')', $serviceValues);
                });
            });

            $outer->orWhereRaw('LOWER(TRIM(type)) in ('.$typePlaceholders.')', $typeValues);

            $outer->orWhere(function (Builder $meta) use ($businessType) {
                $meta->where('meta_data->general_inventory->business_type', $businessType);
            });
        });
    }

    public function applyItemOrBillingType(Builder $query, ?string $itemType): Builder
    {
        $value = trim((string) $itemType);
        if ($value === '') {
            return $query;
        }

        $aliases = [$value];
        $normalizedBilling = $this->normalizeServiceBillingType($value);
        if ($normalizedBilling) {
            $aliases[] = $normalizedBilling;
            if ($normalizedBilling === self::BILLING_SEMI_ANNUAL) {
                $aliases[] = 'Semi Annually';
                $aliases[] = 'Semi-annual';
            }
        }
        $aliases = array_values(array_unique($aliases));

        return $query->where(function (Builder $inner) use ($aliases) {
            $inner->whereIn('item_type', $aliases)
                ->orWhereIn('billing_cycle', $aliases);
        });
    }

    public function applyLowStock(Builder $query): Builder
    {
        $serviceValues = ['service', 'services', 'subscription', 'package'];
        $placeholders = implode(',', array_fill(0, count($serviceValues), '?'));

        return $query
            ->where('min_alert', '>', 0)
            ->whereColumn('quantity', '<=', 'min_alert')
            ->where(function (Builder $inner) use ($placeholders, $serviceValues) {
                $inner->whereDoesntHave('category')
                    ->orWhereHas('category', function (Builder $category) use ($placeholders, $serviceValues) {
                        $category->where(function (Builder $applies) use ($placeholders, $serviceValues) {
                            $applies->whereNull('applies_to')
                                ->orWhereRaw('TRIM(applies_to) = ?', [''])
                                ->orWhereRaw('LOWER(TRIM(applies_to)) not in ('.$placeholders.')', $serviceValues);
                        });
                    });
            });
    }

    public function isLowStock(Item $item): bool
    {
        if (($item->business_type ?? 'product') !== GeneralInventoryItemTypeService::BUSINESS_TYPE_PRODUCT) {
            return false;
        }

        $minimum = (int) ($item->min_alert ?? 0);
        if ($minimum <= 0) {
            return false;
        }

        return (int) ($item->quantity ?? 0) <= $minimum;
    }

    public function applyRenewalRequired(Builder $query, mixed $value): Builder
    {
        if ($value === null || $value === '') {
            return $query;
        }

        if (is_string($value) && trim($value) === '') {
            return $query;
        }

        return $query->where('renewal_required', $this->toBoolean($value));
    }

    public function applyDateOn(Builder $query, string $column, mixed $value): Builder
    {
        $date = $this->nullableDate($value);
        if ($date === null) {
            return $query;
        }

        return $query->whereDate($column, $date);
    }

    public function applyDateFrom(Builder $query, string $column, mixed $value): Builder
    {
        $date = $this->nullableDate($value);
        if ($date === null) {
            return $query;
        }

        return $query->whereDate($column, '>=', $date);
    }

    public function applyDateTo(Builder $query, string $column, mixed $value): Builder
    {
        $date = $this->nullableDate($value);
        if ($date === null) {
            return $query;
        }

        return $query->whereDate($column, '<=', $date);
    }

    /**
     * @param  array<string,mixed>  $input
     */
    public function applyCreatedAtFilter(Builder $query, array $input): Builder
    {
        $from = $input['created_from'] ?? $input['createdFrom'] ?? $input['creation_date_from'] ?? null;
        $to = $input['created_to'] ?? $input['createdTo'] ?? $input['creation_date_to'] ?? null;
        $hasFrom = $this->nullableDate($from) !== null;
        $hasTo = $this->nullableDate($to) !== null;

        if ($hasFrom) {
            $this->applyDateFrom($query, 'created_at', $from);
        }
        if ($hasTo) {
            $this->applyDateTo($query, 'created_at', $to);
        }
        if ($hasFrom || $hasTo) {
            return $query;
        }

        return $this->applyDateOn(
            $query,
            'created_at',
            $input['created_at'] ?? $input['createdAt'] ?? $input['creation_date'] ?? $input['creationDate'] ?? null
        );
    }

    private function applyContains(Builder $query, string $column, ?string $value): Builder
    {
        $term = trim((string) $value);
        if ($term === '') {
            return $query;
        }

        return $query->where($column, 'like', '%'.$term.'%');
    }

    private function nullableString(mixed $value): ?string
    {
        $text = trim((string) $value);

        return $text === '' ? null : $text;
    }

    private function toBoolean(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        $normalized = strtolower(trim((string) $value));

        return in_array($normalized, ['1', 'true', 'yes', 'on'], true);
    }
}
