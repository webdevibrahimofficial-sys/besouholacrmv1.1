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
}
