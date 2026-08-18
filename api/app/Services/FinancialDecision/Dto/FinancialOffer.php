<?php

namespace App\Services\FinancialDecision\Dto;

final class FinancialOffer
{
    public function __construct(
        public readonly string $grossAmount,
        public readonly string $discountAmount,
        public readonly string $discountPercentage,
        public readonly string $netAmount,
        public readonly string $currency,
        public readonly string $startDate,
        public readonly array $metadata = [],
    ) {
    }

    public function toArray(): array
    {
        return [
            'gross_amount' => $this->grossAmount,
            'discount_amount' => $this->discountAmount,
            'discount_percentage' => $this->discountPercentage,
            'net_amount' => $this->netAmount,
            'currency' => $this->currency,
            'start_date' => $this->startDate,
            'metadata' => $this->metadata,
        ];
    }
}
