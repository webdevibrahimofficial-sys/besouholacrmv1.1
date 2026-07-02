<?php

namespace App\Services;

use App\Models\SubscriptionPlan;
use App\Models\SubscriptionTransaction;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class SubscriptionTransactionService
{
    public function record(Tenant $tenant, array $payload, ?User $actor, string $source = 'manual'): SubscriptionTransaction
    {
        return DB::transaction(function () use ($tenant, $payload, $actor, $source) {
            $transaction = $tenant->subscriptionTransactions()->create([
                'contract_id' => $payload['contract_id'] ?? null,
                'type' => $payload['type'],
                'status' => $payload['status'] ?? 'paid',
                'currency' => strtoupper((string) $payload['currency']),
                'total_amount' => $payload['total_amount'],
                'payment_method' => $payload['payment_method'] ?? null,
                'source' => $source,
                'gateway_provider' => $payload['gateway_provider'] ?? null,
                'gateway_reference' => $payload['gateway_reference'] ?? null,
                'period_start' => $payload['period_start'] ?? null,
                'period_end' => $payload['period_end'] ?? null,
                'notes' => $payload['notes'] ?? null,
                'attachment_path' => $payload['attachment_path'] ?? null,
                'created_by' => $actor?->id,
            ]);

            foreach (($payload['items'] ?? null) ?: $this->defaultItem($payload) as $item) {
                $transaction->items()->create($item);
            }

            return $transaction->load(['items', 'tenant', 'contract', 'creator']);
        });
    }

    public function update(SubscriptionTransaction $transaction, array $payload): SubscriptionTransaction
    {
        return DB::transaction(function () use ($transaction, $payload) {
            $transaction->fill([
                'contract_id' => $payload['contract_id'] ?? $transaction->contract_id,
                'type' => $payload['type'] ?? $transaction->type,
                'status' => $payload['status'] ?? $transaction->status,
                'currency' => isset($payload['currency']) ? strtoupper((string) $payload['currency']) : $transaction->currency,
                'total_amount' => $payload['total_amount'] ?? $transaction->total_amount,
                'payment_method' => $payload['payment_method'] ?? $transaction->payment_method,
                'gateway_provider' => $payload['gateway_provider'] ?? $transaction->gateway_provider,
                'gateway_reference' => $payload['gateway_reference'] ?? $transaction->gateway_reference,
                'period_start' => array_key_exists('period_start', $payload) ? $payload['period_start'] : $transaction->period_start,
                'period_end' => array_key_exists('period_end', $payload) ? $payload['period_end'] : $transaction->period_end,
                'notes' => array_key_exists('notes', $payload) ? $payload['notes'] : $transaction->notes,
                'attachment_path' => array_key_exists('attachment_path', $payload) ? $payload['attachment_path'] : $transaction->attachment_path,
            ]);
            $transaction->save();

            if (array_key_exists('items', $payload)) {
                $transaction->items()->delete();
                foreach (($payload['items'] ?? null) ?: $this->defaultItem([
                    ...$payload,
                    'plan_code' => $payload['plan_code'] ?? $transaction->contract?->plan_code,
                    'plan_label' => $payload['plan_label'] ?? 'Subscription',
                    'total_amount' => $payload['total_amount'] ?? $transaction->total_amount,
                ]) as $item) {
                    $transaction->items()->create($item);
                }
            }

            return $transaction->load(['items', 'tenant', 'contract', 'creator']);
        });
    }

    public function inferType(Tenant $tenant, ?string $oldPlan, ?string $newPlan, bool $isNewTenant): string
    {
        if ($isNewTenant) {
            return 'creation';
        }

        if ($oldPlan && $newPlan && $oldPlan !== $newPlan) {
            return $this->planRank($newPlan) > $this->planRank($oldPlan) ? 'upgrade' : 'downgrade';
        }

        return 'renewal';
    }

    public function defaultItem(array $payload): array
    {
        return [[
            'item_type' => 'plan',
            'item_code' => $payload['plan_code'] ?? null,
            'label' => $payload['plan_label'] ?? 'Subscription',
            'quantity' => 1,
            'unit_price' => $payload['total_amount'],
            'amount' => $payload['total_amount'],
        ]];
    }

    private function planRank(string $code): int
    {
        return (int) (SubscriptionPlan::query()->where('code', $code)->value('display_order') ?? 0);
    }
}
