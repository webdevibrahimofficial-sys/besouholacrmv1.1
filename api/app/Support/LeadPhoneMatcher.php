<?php

namespace App\Support;

use App\Models\Lead;
use Illuminate\Support\Facades\Schema;

class LeadPhoneMatcher
{
    protected static ?array $leadPhoneColumns = null;

    protected const EXTRA_LEAD_PHONE_KEYS = [
        'other_mobile',
        'otherMobile',
        'other_phone',
        'otherPhone',
        'phone2',
        'phone_2',
        'mobile2',
        'mobile_2',
        'whatsapp_phone',
        'whatsappPhone',
    ];

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

    public static function buildLeadPhoneVariants(Lead $lead): array
    {
        $variants = [];

        foreach (self::extractLeadPhoneCandidates($lead) as $value) {
            $variants = array_merge($variants, self::buildPhoneVariants((string) $value));
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

        $phoneColumns = self::leadPhoneColumns();
        if (empty($phoneColumns)) {
            return null;
        }

        $leads = Lead::where('tenant_id', $tenantId)
            ->where(function ($q) use ($significantVariants, $phoneColumns) {
                foreach ($significantVariants as $variant) {
                    foreach ($phoneColumns as $column) {
                        $q->orWhere($column, 'like', "%{$variant}%");
                    }
                }
            })
            ->get();

        foreach ($leads as $lead) {
            $leadVariants = self::buildLeadPhoneVariants($lead);

            if (array_intersect($searchVariants, $leadVariants)) {
                return $lead;
            }
        }

        return null;
    }

    protected static function leadPhoneColumns(): array
    {
        if (self::$leadPhoneColumns !== null) {
            return self::$leadPhoneColumns;
        }

        $columns = [];
        foreach (array_unique(array_merge(['phone', 'mobile'], self::EXTRA_LEAD_PHONE_KEYS)) as $column) {
            if (Schema::hasColumn('leads', $column)) {
                $columns[] = $column;
            }
        }

        self::$leadPhoneColumns = $columns;

        return self::$leadPhoneColumns;
    }

    protected static function extractLeadPhoneCandidates(Lead $lead): array
    {
        $values = [];

        foreach (self::leadPhoneColumns() as $column) {
            $values[] = $lead->{$column} ?? null;
        }

        $metaData = is_array($lead->meta_data ?? null) ? $lead->meta_data : [];
        foreach (self::EXTRA_LEAD_PHONE_KEYS as $key) {
            $values[] = $metaData[$key] ?? null;
        }

        $notesPhoneMatch = preg_match(
            '/(?:^|\n)\s*Other phones?\s*:\s*([^\n]+)/i',
            (string) ($lead->notes ?? $lead->note ?? ''),
            $matches
        );

        if ($notesPhoneMatch === 1) {
            $values[] = $matches[1] ?? null;
        }

        return array_values(array_filter($values, fn ($value) => filled($value)));
    }
}
