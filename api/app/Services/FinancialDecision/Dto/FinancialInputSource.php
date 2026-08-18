<?php

namespace App\Services\FinancialDecision\Dto;

final class FinancialInputSource
{
    public function __construct(
        public readonly string $sourceType,
        public readonly ?int $sourceId,
        public readonly string $sourceVersion,
        public readonly string $confidence,
        public readonly string $resolvedFrom,
        public readonly array $candidates = [],
    ) {
    }

    public function toArray(): array
    {
        return [
            'source_type' => $this->sourceType,
            'source_id' => $this->sourceId,
            'source_version' => $this->sourceVersion,
            'confidence' => $this->confidence,
            'resolved_from' => $this->resolvedFrom,
            'candidates' => $this->candidates,
        ];
    }
}
