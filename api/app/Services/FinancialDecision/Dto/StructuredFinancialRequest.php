<?php

namespace App\Services\FinancialDecision\Dto;

final class StructuredFinancialRequest
{
    public const ALLOWED_FIELDS = [
        'intent',
        'lead_id',
        'unit_id',
        'quote_id',
        'discount_percentage',
        'discount_amount',
        'down_payment_percentage',
        'down_payment_amount',
        'duration_months',
        'duration_years',
        'gross_amount',
        'frequency',
        'mode',
    ];

    public const FORBIDDEN_FIELDS = [
        'decision',
        'npv',
        'npv_ratio',
        'approved',
        'monthly_payment',
        'recommendation',
        'confidence',
        'computed',
        'reasons',
    ];

    public function __construct(
        public readonly string $intent = 'evaluate',
        public readonly ?int $leadId = null,
        public readonly ?int $unitId = null,
        public readonly ?int $quoteId = null,
        public readonly ?string $discountPercentage = null,
        public readonly ?string $discountAmount = null,
        public readonly ?string $downPaymentPercentage = null,
        public readonly ?string $downPaymentAmount = null,
        public readonly ?int $durationMonths = null,
        public readonly ?int $durationYears = null,
        public readonly ?string $grossAmount = null,
        public readonly ?string $frequency = null,
        public readonly string $mode = 'evaluate',
        public readonly array $strippedFields = [],
        public readonly string $parserSource = 'php',
    ) {
    }

    public function toArray(): array
    {
        return [
            'intent' => $this->intent,
            'lead_id' => $this->leadId,
            'unit_id' => $this->unitId,
            'quote_id' => $this->quoteId,
            'discount_percentage' => $this->discountPercentage,
            'discount_amount' => $this->discountAmount,
            'down_payment_percentage' => $this->downPaymentPercentage,
            'down_payment_amount' => $this->downPaymentAmount,
            'duration_months' => $this->durationMonths,
            'duration_years' => $this->durationYears,
            'gross_amount' => $this->grossAmount,
            'frequency' => $this->frequency,
            'mode' => $this->mode,
            'stripped_fields' => $this->strippedFields,
            'parser_source' => $this->parserSource,
        ];
    }
}
