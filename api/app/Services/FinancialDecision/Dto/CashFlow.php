<?php

namespace App\Services\FinancialDecision\Dto;

final class CashFlow
{
    public function __construct(
        public readonly string $amount,
        public readonly string $date,
        public readonly string $type,
        public readonly int $sequence,
        public readonly ?string $percentage = null,
        public readonly ?string $description = null,
        public readonly array $metadata = [],
    ) {
    }

    public function toArray(): array
    {
        return [
            'amount' => $this->amount,
            'date' => $this->date,
            'type' => $this->type,
            'sequence' => $this->sequence,
            'percentage' => $this->percentage,
            'description' => $this->description,
            'metadata' => $this->metadata,
        ];
    }
}
