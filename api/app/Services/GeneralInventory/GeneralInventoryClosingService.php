<?php

namespace App\Services\GeneralInventory;

final class GeneralInventoryClosingService
{
    public function __construct(
        private readonly GeneralInventoryRevenueService $revenues,
    ) {
    }

    /**
     * @param  array<string,mixed>  $details
     */
    public function normalizeClosingDetails(array $details): array
    {
        $finalAmount = $this->revenues->finalAmountFromDetails($details);

        if (! array_key_exists('closingRevenue', $details) || $details['closingRevenue'] === null || $details['closingRevenue'] === '') {
            $details['closingRevenue'] = $finalAmount;
        }

        if (! array_key_exists('revenue', $details) || $details['revenue'] === null || $details['revenue'] === '') {
            $details['revenue'] = $finalAmount;
        }

        $details['final_amount'] = $finalAmount;

        return $details;
    }
}
