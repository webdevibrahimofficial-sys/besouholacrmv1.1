<?php

namespace App\Services\GeneralInventory;

use App\Models\Item;
use App\Models\ItemCategory;

final class GeneralInventoryItemTypeService
{
    public const CATEGORY_TYPE_PRODUCTS = 'Products';
    public const CATEGORY_TYPE_SERVICES = 'Services';

    public const BUSINESS_TYPE_PRODUCT = 'product';
    public const BUSINESS_TYPE_SERVICE = 'service';

    public function resolveCategoryTypeFromInput(array $input): ?string
    {
        $raw = $input['category_type'] ?? $input['applies_to'] ?? $input['type'] ?? null;

        return $this->normalizeCategoryType(is_string($raw) || is_numeric($raw) ? (string) $raw : null);
    }

    public function normalizeCategoryType(?string $value): ?string
    {
        $normalized = strtolower(trim((string) $value));
        if ($normalized === '') {
            return null;
        }

        return match ($normalized) {
            'service', 'services', 'subscription', 'package' => self::CATEGORY_TYPE_SERVICES,
            'product', 'products' => self::CATEGORY_TYPE_PRODUCTS,
            default => null,
        };
    }

    public function normalizeAppliesTo(?string $appliesTo): string
    {
        return $this->normalizeCategoryType($appliesTo) ?? self::CATEGORY_TYPE_PRODUCTS;
    }

    public function businessTypeFromCategoryType(?string $categoryType): string
    {
        return $this->normalizeCategoryType($categoryType) === self::CATEGORY_TYPE_SERVICES
            ? self::BUSINESS_TYPE_SERVICE
            : self::BUSINESS_TYPE_PRODUCT;
    }

    public function businessTypeFromCategory(?ItemCategory $category): string
    {
        return $this->businessTypeFromCategoryType($category?->applies_to);
    }

    public function businessTypeFromItem(?Item $item): string
    {
        if (! $item) {
            return self::BUSINESS_TYPE_PRODUCT;
        }

        $meta = is_array($item->meta_data) ? $item->meta_data : [];
        $fromMeta = strtolower(trim((string) ($meta['general_inventory']['business_type'] ?? '')));
        if (in_array($fromMeta, [self::BUSINESS_TYPE_PRODUCT, self::BUSINESS_TYPE_SERVICE], true)) {
            return $fromMeta;
        }

        $category = $item->categoryRecord();

        return $this->businessTypeFromCategory($category);
    }

    /**
     * @param  array<string,mixed>  $meta
     * @return array<string,mixed>
     */
    public function withBusinessTypeMeta(array $meta, string $businessType, ?ItemCategory $category = null, ?string $categoryType = null): array
    {
        $resolvedCategoryType = $categoryType
            ?? $this->normalizeCategoryType($category?->applies_to)
            ?? ($businessType === self::BUSINESS_TYPE_SERVICE ? self::CATEGORY_TYPE_SERVICES : self::CATEGORY_TYPE_PRODUCTS);

        $meta['general_inventory'] = array_merge($meta['general_inventory'] ?? [], [
            'business_type' => $businessType,
            'category_type' => $resolvedCategoryType,
            'item_form' => $businessType === self::BUSINESS_TYPE_SERVICE ? 'service' : 'product',
        ]);

        return $meta;
    }
}
