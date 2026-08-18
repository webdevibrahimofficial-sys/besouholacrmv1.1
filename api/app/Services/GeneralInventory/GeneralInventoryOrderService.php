<?php

namespace App\Services\GeneralInventory;

use App\Models\Lead;
use App\Models\Item;
use App\Models\Order;
use App\Models\OrderRequestItem;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class GeneralInventoryOrderService
{
    public function __construct(
        private readonly GeneralInventoryDecisionService $decisions,
        private readonly GeneralInventoryItemTypeService $itemTyping,
    ) {
    }

    /**
     * @param  array<string,mixed>  $details
     */
    public function syncFromReservation(Lead $lead, array $details, int $reservationSourceActionId, ?User $actor): Order
    {
        $lines = $this->normalizeLines($details['reservationGeneralItems'] ?? []);
        if ($lines === []) {
            throw ValidationException::withMessages([
                'items' => 'At least one general inventory item is required to create an order request.',
            ]);
        }

        $order = $this->findByReservationSource((int) $lead->tenant_id, (int) $lead->id, $reservationSourceActionId)
            ?? new Order();

        $totals = $this->calculateTotals($lines);
        $meta = is_array($order->meta_data) ? $order->meta_data : [];
        $meta['general_inventory'] = [
            'workflow' => 'general_inventory_order_request',
            'lead_id' => $lead->id,
            'reservation_source_action_id' => $reservationSourceActionId,
            'reservation_snapshot' => $details['reservationGeneralItems'] ?? [],
            'decision' => $this->decisions->result(
                GeneralInventoryDecisionService::DECISION_PENDING_APPROVAL,
                GeneralInventoryDecisionService::STATUS_PENDING_APPROVAL,
                true,
                [],
                [],
                [
                    'lead_id' => $lead->id,
                    'reservation_source_action_id' => $reservationSourceActionId,
                ],
                GeneralInventoryDecisionService::STATUS_PENDING_APPROVAL
            ),
        ];

        $order->fill([
            'tenant_id' => $lead->tenant_id,
            'uuid' => $order->uuid ?: (string) Str::uuid(),
            'status' => GeneralInventoryDecisionService::STATUS_PENDING_APPROVAL,
            'amount' => $totals['subtotal'],
            'customer_name' => $lead->name,
            'sales_person' => $actor?->name ?? $lead->sales_person ?? null,
            'items' => array_map(fn ($line) => $this->toLegacyItemPayload($line), $lines),
            'discount_rate' => 0,
            'tax' => $totals['tax'],
            'total' => $totals['total'],
            'notes' => $details['reservationNotes'] ?? null,
            'created_by' => $actor?->name ?? 'System',
            'meta_data' => $meta,
        ]);
        $order->save();

        $order->lines()->delete();
        $order->lines()->createMany(array_map(function (array $line) use ($order) {
            return [
                'tenant_id' => $order->tenant_id,
                'item_id' => $line['item_id'],
                'category_id' => $line['category_id'],
                'item_type' => $line['item_type'],
                'item_name_snapshot' => $line['item_name_snapshot'],
                'quantity' => $line['quantity'],
                'unit_price' => $line['unit_price'],
                'line_subtotal' => $line['line_subtotal'],
                'discount_amount' => $line['discount_amount'],
                'tax_amount' => $line['tax_amount'],
                'line_total' => $line['line_total'],
                'billing_type' => $line['billing_type'],
                'meta_data' => $line['meta_data'],
            ];
        }, $lines));

        return $order->fresh('lines');
    }

    public function orderSnapshotForClosing(int $tenantId, int $leadId, int $reservationSourceActionId): ?array
    {
        $order = $this->findByReservationSource($tenantId, $leadId, $reservationSourceActionId);
        if (! $order || ! $this->decisions->isApprovedLike($order->status)) {
            return null;
        }

        $lines = $order->lines()->get()->map(function (OrderRequestItem $line) {
            return [
                'item_id' => $line->item_id,
                'item_name' => $line->item_name_snapshot,
                'quantity' => (float) $line->quantity,
                'price' => (float) $line->unit_price,
                'line_total' => (float) $line->line_total,
                'discount_amount' => (float) $line->discount_amount,
                'tax_amount' => (float) $line->tax_amount,
                'billing_type' => $line->billing_type,
            ];
        })->all();

        return [
            'order_id' => $order->id,
            'subtotal' => (float) $order->amount,
            'tax' => (float) $order->tax,
            'total' => (float) $order->total,
            'lines' => $lines,
        ];
    }

    /**
     * @param  array<string,mixed>  $payload
     */
    public function prepareOrderUpdate(Order $order, array $payload, ?User $actor): array
    {
        $meta = is_array($order->meta_data) ? $order->meta_data : [];
        $isGeneralInventory = (string) ($meta['general_inventory']['workflow'] ?? '') === 'general_inventory_order_request';
        if (! $isGeneralInventory) {
            return $payload;
        }

        $nextStatus = array_key_exists('status', $payload)
            ? $this->decisions->normalizeStatus((string) $payload['status'])
            : $this->decisions->normalizeStatus((string) $order->status);

        if (in_array($nextStatus, [
            GeneralInventoryDecisionService::STATUS_APPROVED,
            GeneralInventoryDecisionService::STATUS_REJECTED,
            GeneralInventoryDecisionService::STATUS_CHANGES_REQUESTED,
        ], true) && ! $this->isManagerLike($actor)) {
            throw new AuthorizationException('Only managers or admins can approve, reject, or request changes on general order requests.');
        }

        $incomingItems = $payload['items'] ?? null;
        if ($this->decisions->isApprovedLike($order->status) && is_array($incomingItems) && $nextStatus !== GeneralInventoryDecisionService::STATUS_PENDING_APPROVAL) {
            throw ValidationException::withMessages([
                'status' => 'Approved general order requests require re-approval after line-item changes.',
            ]);
        }

        if (is_array($incomingItems)) {
            $lines = $this->normalizeLines($incomingItems);
            $totals = $this->calculateTotals($lines);
            $payload['amount'] = $totals['subtotal'];
            $payload['tax'] = $totals['tax'];
            $payload['total'] = $totals['total'];
            $payload['items'] = array_map(fn ($line) => $this->toLegacyItemPayload($line), $lines);
            $meta['general_inventory']['line_snapshot'] = $payload['items'];
            if ($nextStatus === GeneralInventoryDecisionService::STATUS_PENDING_APPROVAL) {
                $meta['general_inventory']['reapproval_required'] = true;
            }
            $payload['meta_data'] = $meta;
        }

        $payload['status'] = $nextStatus;

        return $payload;
    }

    /**
     * @param  array<int,mixed>  $items
     */
    public function replaceOrderLines(Order $order, array $items): void
    {
        $lines = $this->normalizeLines($items);
        $order->lines()->delete();
        $order->lines()->createMany(array_map(function (array $line) use ($order) {
            return [
                'tenant_id' => $order->tenant_id,
                'item_id' => $line['item_id'],
                'category_id' => $line['category_id'],
                'item_type' => $line['item_type'],
                'item_name_snapshot' => $line['item_name_snapshot'],
                'quantity' => $line['quantity'],
                'unit_price' => $line['unit_price'],
                'line_subtotal' => $line['line_subtotal'],
                'discount_amount' => $line['discount_amount'],
                'tax_amount' => $line['tax_amount'],
                'line_total' => $line['line_total'],
                'billing_type' => $line['billing_type'],
                'meta_data' => $line['meta_data'],
            ];
        }, $lines));
    }

    /**
     * @param  array<int,mixed>  $rows
     * @return list<array<string,mixed>>
     */
    private function normalizeLines(array $rows): array
    {
        $lines = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $item = null;
            $itemId = $row['item_id'] ?? $row['item'] ?? null;
            if (is_numeric($itemId) && (int) $itemId > 0) {
                $item = Item::query()->with('category')->find((int) $itemId);
            }

            $quantity = max(0, (float) ($row['quantity'] ?? 0));
            $unitPrice = max(0, (float) ($row['unit_price'] ?? $row['price'] ?? 0));
            $discount = max(0, (float) ($row['discount_amount'] ?? 0));
            $tax = max(0, (float) ($row['tax_amount'] ?? $row['tax'] ?? 0));
            $itemName = trim((string) ($row['item_name_snapshot'] ?? $row['item_name'] ?? $row['name'] ?? $item?->name ?? ''));
            $businessType = $this->resolveBusinessType($item, $row);
            $billingType = $row['billing_type'] ?? $row['billingCycle'] ?? $item?->billing_cycle ?? null;
            $lineSubtotal = isset($row['line_subtotal']) ? (float) $row['line_subtotal'] : ($quantity * $unitPrice);
            $lineTotal = isset($row['line_total']) && $row['line_total'] !== ''
                ? (float) $row['line_total']
                : max(0, $lineSubtotal - $discount + $tax);

            $this->assertLineIsValid($businessType, $itemName, $quantity, $unitPrice, $billingType);

            $lines[] = [
                'item_id' => $item?->id ?: (is_numeric($itemId) ? (int) $itemId : null),
                'category_id' => $item?->category_id ?: (is_numeric($row['category_id'] ?? null) ? (int) $row['category_id'] : null),
                'item_type' => $businessType,
                'item_name_snapshot' => $itemName,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'line_subtotal' => $lineSubtotal,
                'discount_amount' => $discount,
                'tax_amount' => $tax,
                'line_total' => $lineTotal,
                'billing_type' => $billingType,
                'meta_data' => array_merge(is_array($row['meta_data'] ?? null) ? $row['meta_data'] : [], [
                    'item_snapshot' => [
                        'item_id' => $item?->id,
                        'item_name' => $item?->name,
                        'category_id' => $item?->category_id,
                        'category_type' => $item?->categoryRecord()?->applies_to ?? $item?->category_type,
                        'pricing_type' => $item?->pricing_type,
                        'billing_cycle' => $item?->billing_cycle,
                        'catalog_amount' => (float) ($item?->price ?? 0),
                        'service_amount' => $businessType === 'service' ? (float) ($item?->price ?? 0) : null,
                        'order_unit_price' => $unitPrice,
                    ],
                ]),
            ];
        }

        return $lines;
    }

    /**
     * @param  list<array<string,mixed>>  $lines
     * @return array{subtotal:float,tax:float,total:float}
     */
    private function calculateTotals(array $lines): array
    {
        $subtotal = (float) collect($lines)->sum(fn ($line) => (float) $line['line_subtotal']);
        $tax = (float) collect($lines)->sum(fn ($line) => (float) $line['tax_amount']);
        $total = (float) collect($lines)->sum(fn ($line) => (float) $line['line_total']);

        return [
            'subtotal' => round($subtotal, 2),
            'tax' => round($tax, 2),
            'total' => round($total, 2),
        ];
    }

    /**
     * @param  array<string,mixed>  $line
     * @return array<string,mixed>
     */
    private function toLegacyItemPayload(array $line): array
    {
        return [
            'item_id' => $line['item_id'],
            'item_type' => $line['item_type'],
            'name' => $line['item_name_snapshot'],
            'quantity' => $line['quantity'],
            'price' => $line['unit_price'],
            'line_subtotal' => $line['line_subtotal'],
            'discount_amount' => $line['discount_amount'],
            'tax_amount' => $line['tax_amount'],
            'line_total' => $line['line_total'],
            'billing_type' => $line['billing_type'],
        ];
    }

    private function findByReservationSource(int $tenantId, int $leadId, int $reservationSourceActionId): ?Order
    {
        return Order::query()
            ->where('tenant_id', $tenantId)
            ->get()
            ->first(function (Order $order) use ($leadId, $reservationSourceActionId) {
                $meta = is_array($order->meta_data) ? $order->meta_data : [];
                $general = is_array($meta['general_inventory'] ?? null) ? $meta['general_inventory'] : [];

                return (int) ($general['lead_id'] ?? 0) === $leadId
                    && (int) ($general['reservation_source_action_id'] ?? 0) === $reservationSourceActionId;
            });
    }

    private function resolveBusinessType(?Item $item, array $row): string
    {
        $explicit = strtolower(trim((string) ($row['item_type'] ?? '')));
        if (in_array($explicit, ['product', 'service'], true)) {
            return $explicit;
        }

        if (trim((string) ($row['billing_type'] ?? $row['billingCycle'] ?? '')) !== '') {
            return 'service';
        }

        $appliesTo = strtolower(trim((string) ($item?->categoryRecord()?->applies_to ?? '')));
        if (in_array($appliesTo, ['service', 'services', 'subscription', 'package'], true)) {
            return 'service';
        }

        return $this->itemTyping->businessTypeFromItem($item);
    }

    private function assertLineIsValid(string $businessType, string $itemName, float $quantity, float $unitPrice, mixed $billingType): void
    {
        if ($itemName === '') {
            throw ValidationException::withMessages([
                'items' => 'Each order request line must include an item or service name.',
            ]);
        }

        if ($quantity <= 0) {
            throw ValidationException::withMessages([
                'quantity' => 'Each order request line must have a quantity greater than zero.',
            ]);
        }

        if ($unitPrice < 0) {
            throw ValidationException::withMessages([
                'price' => 'Unit price cannot be negative.',
            ]);
        }

        if ($businessType === 'service' && trim((string) $billingType) === '') {
            throw ValidationException::withMessages([
                'billing_type' => 'Service lines require a billing type.',
            ]);
        }
    }

    private function isManagerLike(?User $actor): bool
    {
        if (! $actor) {
            return false;
        }

        if ((bool) ($actor->is_super_admin ?? false) || (bool) ($actor->is_primary_admin ?? false) || (bool) ($actor->is_tenant_admin ?? false)) {
            return true;
        }

        $roleValues = [
            strtolower(trim((string) ($actor->role ?? ''))),
            strtolower(trim((string) ($actor->job_title ?? ''))),
        ];

        return collect($roleValues)->contains(fn (string $role) => $role !== '' && (
            str_contains($role, 'admin')
            || str_contains($role, 'manager')
            || str_contains($role, 'director')
            || str_contains($role, 'team leader')
        ));
    }
}
