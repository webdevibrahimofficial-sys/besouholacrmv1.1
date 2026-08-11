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
        'phone_number',
        'phoneNumber',
        'secondary_phone',
        'secondaryPhone',
        'secondary_mobile',
        'secondaryMobile',
        'phone2',
        'phone_2',
        'mobile2',
        'mobile_2',
        'whatsapp',
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
            $variants = array_merge($variants, PhoneNormalizer::variantsForSearch($digits));

            $withoutLeadingZeros = ltrim($digits, '0');
            if ($withoutLeadingZeros !== '') {
                $variants[] = $withoutLeadingZeros;
                $variants = array_merge($variants, PhoneNormalizer::variantsForSearch($withoutLeadingZeros));
            }

            if (str_starts_with($digits, '20') && strlen($digits) > 2) {
                $local = '0' . substr($digits, 2);
                $variants[] = $local;
                $variants[] = substr($digits, 2);
                $variants = array_merge($variants, PhoneNormalizer::variantsForSearch($local, '20'));
            }

            if (str_starts_with($digits, '0') && strlen($digits) > 1) {
                $variants[] = '20' . substr($digits, 1);
                $variants[] = substr($digits, 1);
                $variants = array_merge($variants, PhoneNormalizer::variantsForSearch($digits, '20'));
            }
        }

        return self::normalizeVariantList($variants);
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
        $mapped = self::mapPhonesToLeads($tenantId, [$phone]);

        return $mapped[$phone] ?? null;
    }

    /**
     * Batch-resolve many phone numbers to leads in as few queries as possible.
     *
     * @param  array<int, string>  $phones
     * @return array<string, Lead>  map of the original phone string => Lead
     */
    public static function mapPhonesToLeads(int $tenantId, array $phones): array
    {
        $phoneColumns = self::leadPhoneColumns();
        if ($tenantId <= 0 || empty($phoneColumns) || empty($phones)) {
            return [];
        }

        $phonesByOriginal = [];
        $allSignificantVariants = [];

        foreach ($phones as $phone) {
            $raw = trim((string) $phone);
            if ($raw === '') {
                continue;
            }

            $variants = self::buildPhoneVariants($raw);
            $significant = array_values(array_filter($variants, fn ($v) => strlen((string) $v) >= 7));
            if (empty($significant)) {
                continue;
            }

            $phonesByOriginal[$raw] = [
                'variants' => $variants,
                'significant' => $significant,
            ];
            foreach ($significant as $variant) {
                $allSignificantVariants[$variant] = true;
            }
        }

        if (empty($phonesByOriginal)) {
            return [];
        }

        $significantList = array_keys($allSignificantVariants);

        $selectColumns = array_values(array_unique(array_merge(
            ['id', 'tenant_id', 'name'],
            $phoneColumns,
            array_values(array_filter(
                ['meta_data', 'notes', 'note'],
                fn ($column) => Schema::hasColumn('leads', $column)
            ))
        )));

        $leads = Lead::query()
            ->where('tenant_id', $tenantId)
            ->where(function ($q) use ($significantList, $phoneColumns) {
                foreach ($phoneColumns as $column) {
                    $q->orWhereIn($column, $significantList);
                    foreach ($significantList as $variant) {
                        // Prefer suffix/local-number matches without scanning the entire table
                        // with leading wildcards when possible; keep LIKE for formatted values.
                        $q->orWhere($column, 'like', '%' . $variant . '%');
                    }
                }
            })
            ->get($selectColumns);

        $variantToLead = [];
        foreach ($leads as $lead) {
            foreach (self::buildLeadPhoneVariants($lead) as $variant) {
                if ($variant === '' || isset($variantToLead[$variant])) {
                    continue;
                }
                $variantToLead[$variant] = $lead;
            }
        }

        $result = [];
        foreach ($phonesByOriginal as $original => $meta) {
            foreach ($meta['variants'] as $variant) {
                if (isset($variantToLead[$variant])) {
                    $result[$original] = $variantToLead[$variant];
                    break;
                }
            }
        }

        return $result;
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

    protected static function normalizeVariantList(array $variants): array
    {
        $out = [];

        foreach ($variants as $variant) {
            $value = trim((string) $variant);
            if ($value === '') {
                continue;
            }

            $digits = PhoneNormalizer::digits($value);
            if ($digits !== '') {
                $out[$digits] = true;

                $normalized = PhoneNormalizer::normalize($digits);
                if ($normalized !== '') {
                    $out[$normalized] = true;
                }

                if (str_starts_with($normalized, '0')) {
                    $out[substr($normalized, 1)] = true;
                }
            }

            $out[$value] = true;
        }

        return array_keys($out);
    }
}
