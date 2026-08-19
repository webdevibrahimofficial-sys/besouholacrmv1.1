<?php

namespace App\Services\GeneralInventory;

use App\Models\InventoryRequest;
use App\Models\Item;
use App\Models\Lead;
use App\Models\User;
use App\Services\ItemStockService;
use Illuminate\Support\Collection;

final class GeneralInventoryRequestService
{
    public function __construct(
        private readonly ItemStockService $stock,
        private readonly GeneralInventoryDecisionService $decisions,
        private readonly GeneralInventoryItemTypeService $itemTyping,
    ) {
    }

    public function findMatchingRequest(Lead $lead, int $reservationActionId): ?InventoryRequest
    {
        return $this->findMatchingRequests($lead, $reservationActionId)->first();
    }

    /**
     * @return Collection<int, InventoryRequest>
     */
    public function findMatchingRequests(Lead $lead, int $reservationActionId): Collection
    {
        if ($reservationActionId < 1) {
            return collect();
        }

        return InventoryRequest::query()
            ->where('tenant_id', $lead->tenant_id)
            ->where('type', 'Booking')
            ->orderBy('id')
            ->get()
            ->filter(function ($requestModel) use ($lead, $reservationActionId) {
                $meta = is_array($requestModel->meta_data) ? $requestModel->meta_data : [];
                $metaSourceActionId = isset($meta['source_action_id']) ? (int) $meta['source_action_id'] : null;
                $metaLeadId = isset($meta['lead_id']) ? (int) $meta['lead_id'] : null;

                return $metaSourceActionId === $reservationActionId && $metaLeadId === (int) $lead->id;
            })
            ->values();
    }

    /**
     * @param  array<string,mixed>  $details
     */
    public function syncReservationRequests(
        Lead $lead,
        array $details,
        int $reservationActionId,
        bool $isReservationNow,
        bool $isClosing,
        ?\DateTimeInterface $reservationExpiresAt,
        ?int $leadActionId,
        ?User $actor,
    ): void {
        $items = is_array($details['reservationGeneralItems'] ?? null) ? $details['reservationGeneralItems'] : [];
        $reservationNotes = $details['reservationNotes'] ?? null;
        $lines = [];

        foreach ($items as $itemData) {
            if (! is_array($itemData)) {
                continue;
            }

            $itemModel = Item::find($itemData['item'] ?? $itemData['item_id'] ?? null);
            $qty = max(0, (int) ($itemData['quantity'] ?? 1));
            $price = (float) ($itemData['price'] ?? 0);
            $addonsTotal = (float) ($itemData['addons_total'] ?? 0);
            $discountAmount = (float) ($itemData['discount_amount'] ?? 0);
            $lineTotal = isset($itemData['line_total']) && $itemData['line_total'] !== ''
                ? (float) $itemData['line_total']
                : max(0, ($qty * $price) + $addonsTotal - $discountAmount);
            $productName = $itemModel?->name ?? (string) ($itemData['item_name'] ?? $itemData['item'] ?? '');

            if ($qty < 1 || trim($productName) === '') {
                continue;
            }

            $lines[] = [
                'row' => $itemData,
                'item' => $itemModel,
                'quantity' => $qty,
                'price' => $price,
                'addons_total' => $addonsTotal,
                'discount_amount' => $discountAmount,
                'line_total' => $lineTotal,
                'product_name' => $productName,
                'is_service' => $this->isServiceLine($itemModel, $itemData),
            ];
        }

        if ($lines === []) {
            return;
        }

        $existingRequests = $this->findMatchingRequests($lead, $reservationActionId);
        if ($existingRequests->isNotEmpty()) {
            if ($isClosing) {
                foreach ($existingRequests as $existingRequest) {
                    $this->stock->sellRequest($existingRequest, 'lead_action', $leadActionId);
                }
            }

            return;
        }

        $totalQuantity = (int) collect($lines)->sum(fn (array $line) => (int) $line['quantity']);
        $totalAmount = (float) collect($lines)->sum(fn (array $line) => (float) $line['line_total']);
        $productLabel = (string) $lines[0]['product_name'];
        $normalizedRows = array_map(fn (array $line) => $line['row'], $lines);

        $inventoryRequest = InventoryRequest::create([
            'tenant_id' => $lead->tenant_id,
            'customer_name' => $lead->name,
            'product' => $productLabel,
            'quantity' => $totalQuantity,
            'description' => $reservationNotes,
            'status' => GeneralInventoryDecisionService::STATUS_PENDING,
            'type' => 'Booking',
            'source' => $lead->source ?? '',
            'assigned_to' => $lead->assigned_to ?: $actor?->id,
            'meta_data' => [
                'lead_id' => $lead->id,
                'price' => (float) $lines[0]['price'],
                'total' => $totalAmount,
                'line_total' => $totalAmount,
                'addons_total' => (float) collect($lines)->sum(fn (array $line) => (float) $line['addons_total']),
                'discount_amount' => (float) collect($lines)->sum(fn (array $line) => (float) $line['discount_amount']),
                'reservationAmount' => $totalAmount,
                'reservationGeneralItems' => $normalizedRows,
                'source_action_id' => $reservationActionId,
                'source_action_type' => $isClosing ? 'closing_deals' : 'reservation',
                'stage_type' => $isClosing ? 'closing_deal' : 'reservation',
                'customer_phone' => $lead->phone,
                'created_by_name' => $actor?->name ?? '',
                'created_by_id' => $actor?->id,
                'assigned_to_id' => $lead->assigned_to ?: $actor?->id,
                'assigned_to_name' => $lead->assignedUser?->name ?? $actor?->name ?? '',
                'general_inventory' => [
                    'decision' => $this->decisions->result(
                        GeneralInventoryDecisionService::DECISION_APPROVED,
                        GeneralInventoryDecisionService::STATUS_PENDING,
                        true,
                        [],
                        [],
                        [
                            'lead_id' => $lead->id,
                            'source_action_id' => $reservationActionId,
                            'stage_type' => $isClosing ? 'closing_deal' : 'reservation',
                        ],
                        $isClosing
                            ? GeneralInventoryDecisionService::STATUS_CONVERTED
                            : GeneralInventoryDecisionService::STATUS_PENDING
                    ),
                    'item_snapshot' => [
                        'item_id' => $lines[0]['item']?->id,
                        'item_name' => $productLabel,
                        'quantity' => $totalQuantity,
                        'unit_price' => (float) $lines[0]['price'],
                        'line_total' => $totalAmount,
                        'lines' => array_map(fn (array $line) => [
                            'item_id' => $line['item']?->id,
                            'item_name' => $line['product_name'],
                            'quantity' => $line['quantity'],
                            'unit_price' => $line['price'],
                            'line_total' => $line['line_total'],
                            'business_type' => $line['is_service']
                                ? GeneralInventoryItemTypeService::BUSINESS_TYPE_SERVICE
                                : GeneralInventoryItemTypeService::BUSINESS_TYPE_PRODUCT,
                        ], $lines),
                    ],
                ],
            ],
        ]);

        foreach ($lines as $line) {
            $itemModel = $line['item'];
            if (! $itemModel || $line['is_service']) {
                continue;
            }

            if ($isReservationNow && ! $isClosing) {
                $this->stock->reserveForRequest($inventoryRequest, $itemModel, $line['quantity'], $reservationExpiresAt);
                continue;
            }

            if ($isClosing) {
                $this->stock->markSoldFromAvailableForRequest(
                    $inventoryRequest,
                    $itemModel,
                    $line['quantity'],
                    'lead_action',
                    $leadActionId
                );
            }
        }
    }

    /**
     * @param  array<string,mixed>  $row
     */
    private function isServiceLine(?Item $item, array $row): bool
    {
        if (($row['business_type'] ?? $row['item_type'] ?? '') === GeneralInventoryItemTypeService::BUSINESS_TYPE_SERVICE) {
            return true;
        }

        return $this->itemTyping->businessTypeFromItem($item) === GeneralInventoryItemTypeService::BUSINESS_TYPE_SERVICE;
    }
}
