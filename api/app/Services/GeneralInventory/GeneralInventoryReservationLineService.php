<?php

namespace App\Services\GeneralInventory;

use App\Models\Item;
use Illuminate\Validation\ValidationException;

final class GeneralInventoryReservationLineService
{
    public function __construct(
        private readonly GeneralInventoryItemTypeService $itemTyping,
        private readonly GeneralInventoryItemCatalogService $catalog,
    ) {
    }

    /**
     * @param  array<string,mixed>  $details
     * @return array<string,mixed>
     */
    public function normalizeDetails(array $details): array
    {
        $rows = is_array($details['reservationGeneralItems'] ?? null)
            ? $details['reservationGeneralItems']
            : [];

        $normalized = $this->normalizeRows($rows);
        $details['reservationGeneralItems'] = $normalized;

        $total = (float) collect($normalized)->sum(fn (array $row) => (float) ($row['line_total'] ?? 0));
        if (! array_key_exists('reservationAmount', $details) || $details['reservationAmount'] === null || $details['reservationAmount'] === '') {
            $details['reservationAmount'] = $total;
        }

        return $details;
    }

    /**
     * @param  array<int,mixed>  $rows
     * @return list<array<string,mixed>>
     */
    public function normalizeRows(array $rows): array
    {
        $normalized = [];

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $itemId = (int) ($row['item'] ?? $row['item_id'] ?? 0);
            if ($itemId < 1) {
                continue;
            }

            $item = Item::query()->with(['category', 'addons'])->find($itemId);
            if (! $item) {
                throw ValidationException::withMessages([
                    'item' => "Item #{$itemId} was not found.",
                ]);
            }

            $normalized[] = $this->normalizeRow($row, $item);
        }

        return $normalized;
    }

    /**
     * Product lines that must pass stock checks.
     *
     * @param  list<array<string,mixed>>  $rows
     * @return list<array{item:int,quantity:int}>
     */
    public function stockCheckRows(array $rows): array
    {
        $needed = [];

        foreach ($rows as $row) {
            if (($row['business_type'] ?? GeneralInventoryItemTypeService::BUSINESS_TYPE_PRODUCT)
                !== GeneralInventoryItemTypeService::BUSINESS_TYPE_PRODUCT) {
                continue;
            }

            $itemId = (int) ($row['item'] ?? $row['item_id'] ?? 0);
            $qty = max(0, (int) ($row['quantity'] ?? 0));
            if ($itemId < 1 || $qty < 1) {
                continue;
            }

            $needed[] = ['item' => $itemId, 'quantity' => $qty];
        }

        return $needed;
    }

    public function isServiceItem(?Item $item): bool
    {
        return $this->itemTyping->businessTypeFromItem($item) === GeneralInventoryItemTypeService::BUSINESS_TYPE_SERVICE;
    }

    /**
     * @param  array<string,mixed>  $row
     * @return array<string,mixed>
     */
    private function normalizeRow(array $row, Item $item): array
    {
        $businessType = $this->itemTyping->businessTypeFromItem($item);
        $isService = $businessType === GeneralInventoryItemTypeService::BUSINESS_TYPE_SERVICE;
        $billingType = $this->catalog->normalizeServiceBillingType(
            $row['billing_type'] ?? $row['billingCycle'] ?? $row['billing_cycle'] ?? $item->billing_cycle ?? null
        );

        if ($isService && $billingType === null) {
            throw ValidationException::withMessages([
                'billing_type' => 'Service lines require a billing type.',
            ]);
        }

        $quantity = $isService ? 1 : max(0, (int) ($row['quantity'] ?? 1));
        if (! $isService && $quantity < 1) {
            throw ValidationException::withMessages([
                'quantity' => "{$item->name} cannot be reserved because the quantity is zero.",
            ]);
        }

        $unitPrice = isset($row['price']) && $row['price'] !== ''
            ? (float) $row['price']
            : (float) ($item->price ?? 0);

        $selectedAddons = $this->normalizeAddons($row, $item, $isService);
        $addonsTotal = (float) collect($selectedAddons)->sum(fn (array $addon) => (float) ($addon['total'] ?? 0));
        $subTotal = ($quantity * $unitPrice) + $addonsTotal;
        $discountAmount = $this->discountAmount($row, $subTotal);
        $lineTotal = isset($row['line_total']) && $row['line_total'] !== ''
            ? max(0, (float) $row['line_total'])
            : max(0, $subTotal - $discountAmount);

        $categoryId = $item->category_id ?: (is_numeric($row['category'] ?? $row['category_id'] ?? null)
            ? (int) ($row['category'] ?? $row['category_id'])
            : null);

        return array_merge($row, [
            'item' => $item->id,
            'item_id' => $item->id,
            'item_name' => $item->name,
            'category' => $categoryId,
            'category_id' => $categoryId,
            'category_name' => $item->categoryRecord()?->name ?? (string) ($row['category_name'] ?? ''),
            'quantity' => $quantity,
            'price' => $unitPrice,
            'business_type' => $businessType,
            'item_type' => $businessType,
            'category_type' => $isService
                ? GeneralInventoryItemTypeService::CATEGORY_TYPE_SERVICES
                : GeneralInventoryItemTypeService::CATEGORY_TYPE_PRODUCTS,
            'billing_type' => $isService ? $billingType : null,
            'billingCycle' => $isService ? $billingType : ($row['billingCycle'] ?? null),
            'addon_ids' => array_values(array_filter(array_map(
                fn (array $addon) => $addon['id'] ?? null,
                $selectedAddons
            ))),
            'addons' => $selectedAddons,
            'addons_total' => $addonsTotal,
            'sub_total' => $subTotal,
            'discount_amount' => $discountAmount,
            'line_total' => $lineTotal,
            'catalog_amount' => (float) ($item->price ?? 0),
            'service_amount' => $isService ? (float) ($item->price ?? 0) : null,
        ]);
    }

    /**
     * @param  array<string,mixed>  $row
     * @return list<array<string,mixed>>
     */
    private function normalizeAddons(array $row, Item $item, bool $isService): array
    {
        $selectedIds = [];
        if (is_array($row['addon_ids'] ?? null)) {
            $selectedIds = $row['addon_ids'];
        } elseif (is_array($row['addons'] ?? null)) {
            $selectedIds = array_map(
                fn ($addon) => is_array($addon) ? ($addon['id'] ?? $addon['addon_id'] ?? null) : $addon,
                $row['addons']
            );
        }

        $selectedIds = array_values(array_filter(array_map(fn ($id) => (int) $id, $selectedIds)));
        if ($selectedIds === []) {
            return [];
        }

        $idSet = array_flip($selectedIds);
        $normalized = [];

        foreach ($item->addons as $addon) {
            if (! isset($idSet[(int) $addon->id])) {
                continue;
            }

            $price = (float) ($addon->price ?? 0);
            $quantity = $isService ? 1 : max(1, (int) ($addon->quantity ?? 1));
            $period = $isService ? trim((string) ($addon->period ?? '')) : '';

            $normalized[] = [
                'id' => $addon->id,
                'name' => $addon->name ?? '',
                'quantity' => $quantity,
                'price' => $price,
                'period' => $period !== '' ? $period : null,
                'total' => $isService ? $price : ($quantity * $price),
            ];
        }

        return $normalized;
    }

    /**
     * @param  array<string,mixed>  $row
     */
    private function discountAmount(array $row, float $subTotal): float
    {
        if (isset($row['discount_amount']) && $row['discount_amount'] !== '') {
            return max(0, min($subTotal, (float) $row['discount_amount']));
        }

        $raw = (float) ($row['discount_value'] ?? 0);
        if ($raw <= 0) {
            return 0.0;
        }

        if (($row['discount_type'] ?? 'value') === 'percent') {
            return max(0, min($subTotal, ($subTotal * min(100, $raw)) / 100));
        }

        return max(0, min($subTotal, $raw));
    }
}
