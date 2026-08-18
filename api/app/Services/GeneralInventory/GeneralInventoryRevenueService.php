<?php

namespace App\Services\GeneralInventory;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\Revenue;

final class GeneralInventoryRevenueService
{
    public function __construct(
        private readonly GeneralInventoryDecisionService $decisions,
    ) {
    }

    public function finalAmountFromDetails(array $details): float
    {
        foreach (['closingRevenue', 'finalAmount', 'final_amount', 'revenue', 'reservationAmount'] as $field) {
            $value = $details[$field] ?? null;
            if ($value !== null && $value !== '') {
                return max(0, (float) $value);
            }
        }

        $rows = is_array($details['reservationGeneralItems'] ?? null) ? $details['reservationGeneralItems'] : [];
        if ($rows === []) {
            return 0.0;
        }

        return (float) collect($rows)->sum(function ($row) {
            if (! is_array($row)) {
                return 0;
            }

            if (isset($row['line_total']) && $row['line_total'] !== '') {
                return (float) $row['line_total'];
            }

            if (isset($row['total']) && $row['total'] !== '') {
                return (float) $row['total'];
            }

            $qty = (float) ($row['quantity'] ?? 1);
            $price = (float) ($row['price'] ?? 0);
            $addons = (float) ($row['addons_total'] ?? 0);
            $discount = (float) ($row['discount_amount'] ?? 0);

            return max(0, ($qty * $price) + $addons - $discount);
        });
    }

    public function createForClosingOnce(Lead $lead, LeadAction $action, array $details): Revenue
    {
        $reservationSourceActionId = (int) ($details['reservation_source_action_id'] ?? 0);
        $existing = $this->findExistingClosingRevenue((int) $lead->tenant_id, (int) $lead->id, $reservationSourceActionId);
        if ($existing) {
            return $existing;
        }

        $dealItems = [];
        foreach (($details['reservationGeneralItems'] ?? []) as $row) {
            if (! is_array($row)) {
                continue;
            }

            $name = trim((string) ($row['item_name'] ?? $row['name'] ?? ''));
            if ($name === '') {
                continue;
            }

            $dealItems[] = [
                'name' => $name,
                'item_id' => is_numeric($row['item'] ?? $row['item_id'] ?? null)
                    ? (int) ($row['item'] ?? $row['item_id'])
                    : null,
                'amount' => (float) ($row['line_total'] ?? $row['total'] ?? $row['sub_total'] ?? 0),
            ];
        }

        $finalAmount = $this->finalAmountFromDetails($details);

        return Revenue::create([
            'tenant_id' => $lead->tenant_id,
            'user_id' => $lead->assigned_to ?: $action->user_id,
            'lead_id' => $lead->id,
            'action_id' => $action->id,
            'amount' => $finalAmount,
            'currency' => $details['currency'] ?? 'EGP',
            'source' => 'general_inventory_closing',
            'meta_data' => [
                'created_by_id' => $action->user_id,
                'notes' => 'Generated automatically from General Inventory closing',
                'item_name' => collect($dealItems)->pluck('name')->filter()->unique()->implode(', '),
                'deal_items' => $dealItems,
                'general_inventory' => [
                    'decision' => $this->decisions->result(
                        GeneralInventoryDecisionService::DECISION_APPROVED,
                        GeneralInventoryDecisionService::STATUS_CONVERTED,
                        true,
                        [],
                        [],
                        [
                            'lead_id' => $lead->id,
                            'action_id' => $action->id,
                            'reservation_source_action_id' => $reservationSourceActionId,
                        ],
                        GeneralInventoryDecisionService::STATUS_CONVERTED
                    ),
                    'reservation_source_action_id' => $reservationSourceActionId,
                ],
            ],
        ]);
    }

    private function findExistingClosingRevenue(int $tenantId, int $leadId, int $reservationSourceActionId): ?Revenue
    {
        return Revenue::query()
            ->where('tenant_id', $tenantId)
            ->where('lead_id', $leadId)
            ->where('source', 'general_inventory_closing')
            ->get()
            ->first(function (Revenue $revenue) use ($reservationSourceActionId) {
                $meta = is_array($revenue->meta_data) ? $revenue->meta_data : [];
                $general = is_array($meta['general_inventory'] ?? null) ? $meta['general_inventory'] : [];

                return (int) ($general['reservation_source_action_id'] ?? 0) > 0
                    && (int) ($general['reservation_source_action_id'] ?? 0) === $reservationSourceActionId;
            });
    }
}
