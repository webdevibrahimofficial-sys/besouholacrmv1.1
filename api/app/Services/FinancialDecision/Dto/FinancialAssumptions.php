<?php

namespace App\Services\FinancialDecision\Dto;

final class FinancialAssumptions
{
    public function __construct(
        public readonly ?string $discountRate,
        public readonly string $valuationDate,
        public readonly string $dayCountConvention = 'actual_365',
        public readonly string $compoundingFrequency = 'annual',
        public readonly string $roundingRule = 'round_half_up_2',
        public readonly bool $isExplicitlyConfigured = false,
    ) {
    }

    public function snapshot(): array
    {
        return [
            'discount_rate' => $this->discountRate,
            'day_count' => $this->dayCountConvention,
            'compounding' => $this->compoundingFrequency,
            'valuation_date' => $this->valuationDate,
            'rounding_rule' => $this->roundingRule,
            'is_explicitly_configured' => $this->isExplicitlyConfigured,
        ];
    }
}
