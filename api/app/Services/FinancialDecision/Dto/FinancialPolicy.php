<?php

namespace App\Services\FinancialDecision\Dto;

final class FinancialPolicy
{
    public function __construct(
        public readonly ?string $minimumNpvRatio,
        public readonly ?string $minimumInitialCollectionPercentage,
        public readonly ?string $maximumDiscountPercentage,
        public readonly ?string $managerMaximumDiscountPercentage,
        public readonly ?int $maximumDurationMonths,
        public readonly bool $isExplicitlyConfigured = false,
        public readonly ?int $versionId = null,
        public readonly ?int $versionNumber = null,
        public readonly array $thresholds = [],
    ) {
    }

    public function snapshot(): array
    {
        return [
            'version_id' => $this->versionId,
            'version' => $this->versionNumber,
            'minimum_npv_ratio' => $this->minimumNpvRatio,
            'minimum_initial_collection_percentage' => $this->minimumInitialCollectionPercentage,
            'maximum_discount_percentage' => $this->maximumDiscountPercentage,
            'manager_maximum_discount_percentage' => $this->managerMaximumDiscountPercentage,
            'maximum_duration_months' => $this->maximumDurationMonths,
            'is_explicitly_configured' => $this->isExplicitlyConfigured,
        ];
    }
}
