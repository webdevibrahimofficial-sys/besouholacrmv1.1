<?php

namespace App\Services\FinancialDecision\Dto;

final class FinancialDecision
{
    /**
     * @param  list<string>  $reasons
     * @param  list<string>  $warnings
     */
    public function __construct(
        public readonly string $decision,
        public readonly string $status,
        public readonly array $reasons,
        public readonly array $warnings,
        public readonly FinancialMetrics $metrics,
        public readonly array $assumptionsSnapshot,
        public readonly array $policySnapshot,
        public readonly array $inputSource,
        public readonly array $calculationTrace,
        public readonly string $engineVersion,
        public readonly array $recommendations = [],
    ) {
    }

    public function withRecommendations(array $recommendations): self
    {
        return new self(
            decision: $this->decision,
            status: $this->status,
            reasons: $this->reasons,
            warnings: $this->warnings,
            metrics: $this->metrics,
            assumptionsSnapshot: $this->assumptionsSnapshot,
            policySnapshot: $this->policySnapshot,
            inputSource: $this->inputSource,
            calculationTrace: $this->calculationTrace,
            engineVersion: $this->engineVersion,
            recommendations: $recommendations,
        );
    }
}
