<?php

namespace App\Services;

class MetaFieldMappingSuggester
{
    /**
     * Common Meta lead form field keys mapped to CRM field names.
     * Output format matches the frontend: META_FIELD_KEY => CRM_FIELD.
     */
    private const CRM_FIELD_ALIASES = [
        'name' => ['full_name', 'name', 'first_name', 'last_name', 'your_name', 'customer_name'],
        'email' => ['email', 'work_email', 'email_address', 'e-mail', 'business_email'],
        'phone' => ['phone_number', 'phone', 'mobile', 'mobile_number', 'contact_number', 'whatsapp'],
        'utm_source' => ['utm_source', 'source'],
        'utm_campaign' => ['utm_campaign', 'campaign'],
        'utm_medium' => ['utm_medium', 'medium'],
        'notes' => ['message', 'comments', 'notes', 'additional_info', 'question', 'description'],
    ];

    /**
     * @param  array<int, array<string, mixed>>  $questions
     * @return array<string, string>
     */
    public function suggestFromQuestions(array $questions): array
    {
        $mapping = [];

        foreach ($questions as $question) {
            if (! is_array($question)) {
                continue;
            }

            $metaKey = strtolower(trim((string) ($question['key'] ?? $question['name'] ?? '')));
            if ($metaKey === '') {
                continue;
            }

            $label = strtolower(trim((string) ($question['label'] ?? '')));
            $crmField = $this->matchCrmField($metaKey, $label);

            if ($crmField) {
                $mapping[$metaKey] = $crmField;
            }
        }

        return $mapping;
    }

    protected function matchCrmField(string $metaKey, string $label): ?string
    {
        foreach (self::CRM_FIELD_ALIASES as $crmField => $aliases) {
            foreach ($aliases as $alias) {
                $aliasLabel = str_replace('_', ' ', $alias);

                if ($metaKey === $alias || str_contains($metaKey, $alias)) {
                    return $crmField;
                }

                if ($label !== '' && (str_contains($label, $aliasLabel) || str_contains($label, $alias))) {
                    return $crmField;
                }
            }
        }

        return null;
    }
}
