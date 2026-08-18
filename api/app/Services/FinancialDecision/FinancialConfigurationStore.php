<?php

namespace App\Services\FinancialDecision;

use App\Models\FinancialAssumption;
use App\Models\FinancialPolicy as FinancialPolicyModel;
use App\Models\FinancialPolicyVersion;
use App\Models\User;
use App\Services\FinancialDecision\Dto\FinancialAssumptions;
use App\Services\FinancialDecision\Dto\FinancialPolicy;
use Illuminate\Support\Facades\Schema;

final class FinancialConfigurationStore
{
    public function ensureTemplates(int $tenantId): void
    {
        if (! Schema::hasTable('financial_assumptions') || ! Schema::hasTable('financial_policies')) {
            return;
        }

        FinancialAssumption::query()->firstOrCreate(
            ['tenant_id' => $tenantId],
            [
                'discount_rate' => null,
                'day_count_convention' => 'actual_365',
                'compounding_frequency' => 'annual',
                'rounding_rule' => 'round_half_up_2',
                'is_explicitly_configured' => false,
            ]
        );

        FinancialPolicyModel::query()->firstOrCreate(
            ['tenant_id' => $tenantId],
            [
                'name' => 'Default',
                'is_active' => true,
                'is_explicitly_configured' => false,
            ]
        );
    }

    public function assumptions(int $tenantId, string $valuationDate): FinancialAssumptions
    {
        $this->ensureTemplates($tenantId);
        $row = FinancialAssumption::query()->where('tenant_id', $tenantId)->first();

        return new FinancialAssumptions(
            discountRate: $row?->is_explicitly_configured ? ($row->discount_rate !== null ? (string) $row->discount_rate : null) : null,
            valuationDate: $valuationDate,
            dayCountConvention: (string) ($row->day_count_convention ?? 'actual_365'),
            compoundingFrequency: (string) ($row->compounding_frequency ?? 'annual'),
            roundingRule: (string) ($row->rounding_rule ?? 'round_half_up_2'),
            isExplicitlyConfigured: (bool) ($row?->is_explicitly_configured),
        );
    }

    public function policy(int $tenantId): FinancialPolicy
    {
        $this->ensureTemplates($tenantId);
        $row = FinancialPolicyModel::query()->where('tenant_id', $tenantId)->first();
        $version = $row
            ? FinancialPolicyVersion::query()
                ->where('policy_id', $row->id)
                ->orderByDesc('version')
                ->first()
            : null;
        $thresholds = is_array($version?->thresholds) ? $version->thresholds : [];

        return new FinancialPolicy(
            minimumNpvRatio: isset($thresholds['minimum_npv_ratio']) ? (string) $thresholds['minimum_npv_ratio'] : null,
            minimumInitialCollectionPercentage: isset($thresholds['minimum_initial_collection_percentage']) ? (string) $thresholds['minimum_initial_collection_percentage'] : null,
            maximumDiscountPercentage: isset($thresholds['maximum_discount_percentage']) ? (string) $thresholds['maximum_discount_percentage'] : null,
            managerMaximumDiscountPercentage: isset($thresholds['manager_maximum_discount_percentage']) ? (string) $thresholds['manager_maximum_discount_percentage'] : null,
            maximumDurationMonths: isset($thresholds['maximum_duration_months']) ? (int) $thresholds['maximum_duration_months'] : null,
            isExplicitlyConfigured: (bool) ($row?->is_explicitly_configured && $version),
            versionId: $version?->id,
            versionNumber: $version?->version,
            thresholds: $thresholds,
        );
    }

    public function settingsPayload(int $tenantId): array
    {
        $this->ensureTemplates($tenantId);
        $assumptions = FinancialAssumption::query()->where('tenant_id', $tenantId)->first();
        $policy = $this->policy($tenantId);

        return [
            'assumptions' => [
                'discount_rate' => $assumptions?->is_explicitly_configured ? $assumptions->discount_rate : null,
                'day_count_convention' => $assumptions?->day_count_convention,
                'compounding_frequency' => $assumptions?->compounding_frequency,
                'rounding_rule' => $assumptions?->rounding_rule,
                'is_explicitly_configured' => (bool) ($assumptions?->is_explicitly_configured),
            ],
            'policy' => $policy->snapshot(),
        ];
    }

    public function save(int $tenantId, array $payload, User $actor): array
    {
        $this->ensureTemplates($tenantId);
        $assumptions = FinancialAssumption::query()->where('tenant_id', $tenantId)->firstOrFail();
        $policy = FinancialPolicyModel::query()->where('tenant_id', $tenantId)->firstOrFail();

        $rate = $payload['discount_rate'] ?? null;
        $assumptions->fill([
            'discount_rate' => $rate,
            'day_count_convention' => $payload['day_count_convention'] ?? $assumptions->day_count_convention ?? 'actual_365',
            'compounding_frequency' => $payload['compounding_frequency'] ?? $assumptions->compounding_frequency ?? 'annual',
            'rounding_rule' => $payload['rounding_rule'] ?? $assumptions->rounding_rule ?? 'round_half_up_2',
            'is_explicitly_configured' => true,
            'configured_at' => now(),
            'configured_by_id' => $actor->id,
        ])->save();

        $thresholds = [
            'minimum_npv_ratio' => (string) ($payload['minimum_npv_ratio'] ?? '0.80'),
            'minimum_initial_collection_percentage' => (string) ($payload['minimum_initial_collection_percentage'] ?? '10'),
            'maximum_discount_percentage' => (string) ($payload['maximum_discount_percentage'] ?? '5'),
            'manager_maximum_discount_percentage' => (string) ($payload['manager_maximum_discount_percentage'] ?? '8'),
            'maximum_duration_months' => (int) ($payload['maximum_duration_months'] ?? 96),
        ];

        $nextVersion = (int) FinancialPolicyVersion::query()->where('policy_id', $policy->id)->max('version') + 1;
        FinancialPolicyVersion::query()->create([
            'tenant_id' => $tenantId,
            'policy_id' => $policy->id,
            'version' => $nextVersion,
            'thresholds' => $thresholds,
            'created_by_id' => $actor->id,
        ]);

        $policy->forceFill([
            'is_explicitly_configured' => true,
        ])->save();

        return $this->settingsPayload($tenantId);
    }
}
