<?php

namespace App\Support;

use App\Models\Lead;

class LeadPhoneMatcher
{
    /**
     * Build all phone-number variants from a raw phone string (handles
     * multi-number fields separated by / , \n \r | and common Egypt/Gulf
     * international formatting).
     */
    public static function buildPhoneVariants(string $rawPhone): array
    {
        $parts = preg_split('/[\/,,\n\r|]+/', $rawPhone) ?: [];
        $variants = [];

        foreach ($parts as $part) {
            $digits = preg_replace('/\D+/', '', trim($part));
            if ($digits === '') {
                continue;
            }

            $variants[] = $digits;

            $withoutLeadingZeros = ltrim($digits, '0');
            if ($withoutLeadingZeros !== '') {
                $variants[] = $withoutLeadingZeros;
            }

            if (str_starts_with($digits, '20') && strlen($digits) > 2) {
                $local = '0' . substr($digits, 2);
                $variants[] = $local;
                $variants[] = substr($digits, 2);
            }

            if (str_starts_with($digits, '0') && strlen($digits) > 1) {
                $variants[] = '20' . substr($digits, 1);
                $variants[] = substr($digits, 1);
            }
        }

        return array_values(array_unique(array_filter($variants)));
    }

    /**
     * Find the first Lead in a tenant whose phone or mobile matches the
     * given phone number (using the same variant-matching logic as
     * WhatsappMessageController::leadMessages).
     */
    public static function findLeadByPhone(int $tenantId, string $phone): ?Lead
    {
        $searchVariants = self::buildPhoneVariants($phone);
        if (empty($searchVariants)) {
            return null;
        }

        // Use the most specific (longest) variants for the initial LIKE query
        // to avoid overly broad matches.
        $significantVariants = array_values(
            array_filter($searchVariants, fn ($v) => strlen($v) >= 7)
        );

        if (empty($significantVariants)) {
            return null;
        }

        $leads = Lead::where('tenant_id', $tenantId)
            ->where(function ($q) use ($significantVariants) {
                foreach ($significantVariants as $variant) {
                    $q->orWhere('phone', 'like', "%{$variant}%")
                      ->orWhere('mobile', 'like', "%{$variant}%");
                }
            })
            ->get();

        foreach ($leads as $lead) {
            $leadVariants = array_merge(
                self::buildPhoneVariants((string) ($lead->phone ?? '')),
                self::buildPhoneVariants((string) ($lead->mobile ?? ''))
            );

            if (array_intersect($searchVariants, $leadVariants)) {
                return $lead;
            }
        }

        return null;
    }
}
