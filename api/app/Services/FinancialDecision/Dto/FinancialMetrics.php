<?php

namespace App\Services\FinancialDecision\Dto;

final class FinancialMetrics
{
    public function __construct(
        public readonly string $grossAmount,
        public readonly string $discountAmount,
        public readonly string $discountPercentage,
        public readonly string $netAmount,
        public readonly string $npv,
        public readonly string $npvRatio,
        public readonly string $npvPercentage,
        public readonly string $totalCashFlow,
        public readonly string $initialCollectionPercentage,
        public readonly int $durationMonths,
    ) {
    }

    public static function empty(): self
    {
        return new self(
            grossAmount: '0.00',
            discountAmount: '0.00',
            discountPercentage: '0.0000',
            netAmount: '0.00',
            npv: '0.00',
            npvRatio: '0.000000',
            npvPercentage: '0.0000',
            totalCashFlow: '0.00',
            initialCollectionPercentage: '0.0000',
            durationMonths: 0,
        );
    }

    public function toArray(): array
    {
        return [
            'gross_amount' => $this->grossAmount,
            'discount_amount' => $this->discountAmount,
            'discount_percentage' => $this->discountPercentage,
            'net_amount' => $this->netAmount,
            'npv' => $this->npv,
            'npv_ratio' => $this->npvRatio,
            'npv_percentage' => $this->npvPercentage,
            'total_cash_flow' => $this->totalCashFlow,
            'initial_collection_percentage' => $this->initialCollectionPercentage,
            'duration_months' => $this->durationMonths,
        ];
    }
}
