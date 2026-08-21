<?php

namespace App\Services\FinancialDecision;

use App\Services\FinancialDecision\Dto\StructuredFinancialRequest;
use Illuminate\Support\Facades\Http;

final class FinancialRequestParser
{
    public function parse(string $message, string $locale = 'en'): StructuredFinancialRequest
    {
        $llm = $this->parseWithLlm($message, $locale);
        if ($llm !== null) {
            return $this->hydrate($llm, 'llm');
        }

        return $this->hydrate($this->parseWithPhp($message), 'php');
    }

    public function parseLlmOutputOrFallback(string $rawLlmText, string $message, string $locale = 'en'): StructuredFinancialRequest
    {
        $json = $this->extractJson($rawLlmText);
        if (is_array($json)) {
            return $this->hydrate($json, 'llm');
        }

        return $this->hydrate($this->parseWithPhp($message), 'php');
    }

    public function fromArray(array $payload): StructuredFinancialRequest
    {
        return $this->hydrate($payload, 'api');
    }

    public function parseWithPhp(string $message): array
    {
        $parsed = ['intent' => 'evaluate', 'mode' => 'evaluate'];

        if (preg_match('/(أقصى\s*خصم|اكبر\s*خصم|أكبر\s*خصم|max(?:imum)?\s*discount|highest\s*discount)/iu', $message)) {
            $parsed['intent'] = 'max_discount';
            $parsed['mode'] = 'max_discount';
        }

        if (preg_match('/(?:\blead\s*#?\s*|#\s*|ليد\s*(?:رقم|#)?\s*)(\d+)/iu', $message, $match)) {
            $parsed['lead_id'] = (int) $match[1];
        }

        if (preg_match('/(?:سعر(?:\s*الوحدة)?|gross(?:\s*amount)?|total(?:\s*price)?|بمبلغ|مبلغ)\s*[:=]?\s*([\d.,]+)/iu', $message, $match)
            || preg_match('/([\d.,]+)\s*(?:جنيه|EGP|egp)/iu', $message, $match)
        ) {
            $parsed['gross_amount'] = str_replace([',', ' '], '', $match[1]);
        }

        if (preg_match('/(?:خصم|discount)\s*(?:حوالي|about)?\s*(\d+(?:[.,]\d+)?)\s*%/iu', $message, $match)
            || preg_match('/(\d+(?:[.,]\d+)?)\s*%\s*(?:خصم|discount)/iu', $message, $match)
        ) {
            $parsed['discount_percentage'] = str_replace(',', '.', $match[1]);
        }

        if (preg_match('/(?:مقدم|down\s*payment)\s*(?:حوالي|about)?\s*(\d+(?:[.,]\d+)?)\s*%/iu', $message, $match)
            || preg_match('/(\d+(?:[.,]\d+)?)\s*%\s*(?:مقدم|down\s*payment)/iu', $message, $match)
        ) {
            $parsed['down_payment_percentage'] = str_replace(',', '.', $match[1]);
        }

        if (preg_match('/(\d+)\s*(?:سنة|سنين|years?)/iu', $message, $match)) {
            $parsed['duration_years'] = (int) $match[1];
        }

        if (preg_match('/(\d+)\s*(?:شهر|أشهر|months?)/iu', $message, $match)) {
            $parsed['duration_months'] = (int) $match[1];
        }

        return $parsed;
    }

    private function parseWithLlm(string $message, string $locale): ?array
    {
        $apiKey = (string) config('services.gemini.api_key', '');
        if ($apiKey === '') {
            return null;
        }

        $allowed = implode(', ', StructuredFinancialRequest::ALLOWED_FIELDS);
        $prompt = <<<PROMPT
Extract a commercial-offer evaluation request into JSON.
Return ONLY JSON with this whitelist of keys: {$allowed}
Set mode to "max_discount" and intent to "max_discount" when the user asks for the maximum acceptable discount.
Otherwise mode and intent are "evaluate".
Do not compute payments, NPV, or a decision.
Do not invent numbers the user did not state.
Missing values must be null.
Language of the user message: {$locale}

User message:
{$message}
PROMPT;

        try {
            $model = trim((string) config('services.gemini.model', 'gemini-3.6-flash')) ?: 'gemini-3.6-flash';
            $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
                .rawurlencode($model)
                .':generateContent?key='
                .urlencode($apiKey);

            $response = Http::timeout(25)->post($url, [
                'contents' => [[
                    'role' => 'user',
                    'parts' => [['text' => $prompt]],
                ]],
            ]);

            if (! $response->successful()) {
                return null;
            }

            $text = (string) data_get($response->json(), 'candidates.0.content.parts.0.text', '');
            $json = $this->extractJson($text);

            return is_array($json) ? $json : null;
        } catch (\Throwable) {
            return null;
        }
    }

    public function extractJson(string $text): ?array
    {
        $start = strpos($text, '{');
        $end = strrpos($text, '}');
        if ($start === false || $end === false || $end < $start) {
            return null;
        }

        $decoded = json_decode(substr($text, $start, $end - $start + 1), true);

        return is_array($decoded) ? $decoded : null;
    }

    private function hydrate(array $payload, string $source): StructuredFinancialRequest
    {
        $stripped = [];
        foreach (array_keys($payload) as $key) {
            if (in_array($key, StructuredFinancialRequest::FORBIDDEN_FIELDS, true)
                || ! in_array($key, StructuredFinancialRequest::ALLOWED_FIELDS, true)
            ) {
                $stripped[] = (string) $key;
            }
        }

        $mode = strtolower((string) ($payload['mode'] ?? 'evaluate'));
        if ($mode === '') {
            $mode = 'evaluate';
        }
        $intent = strtolower((string) ($payload['intent'] ?? 'evaluate')) ?: 'evaluate';
        if ($intent === 'max_discount' || $mode === 'max_discount') {
            $intent = 'max_discount';
            $mode = 'max_discount';
        }

        return new StructuredFinancialRequest(
            intent: $intent,
            leadId: $this->nullableInt($payload['lead_id'] ?? null),
            unitId: $this->nullableInt($payload['unit_id'] ?? null),
            quoteId: $this->nullableInt($payload['quote_id'] ?? null),
            discountPercentage: $this->nullableNumber($payload['discount_percentage'] ?? null),
            discountAmount: $this->nullableNumber($payload['discount_amount'] ?? null),
            downPaymentPercentage: $this->nullableNumber($payload['down_payment_percentage'] ?? null),
            downPaymentAmount: $this->nullableNumber($payload['down_payment_amount'] ?? null),
            durationMonths: $this->nullableInt($payload['duration_months'] ?? null),
            durationYears: $this->nullableInt($payload['duration_years'] ?? null),
            grossAmount: $this->nullableNumber($payload['gross_amount'] ?? null),
            frequency: $this->nullableString($payload['frequency'] ?? null),
            mode: $mode,
            strippedFields: array_values(array_unique($stripped)),
            parserSource: $source,
        );
    }

    private function nullableInt(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (int) $value ?: null;
    }

    private function nullableNumber(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $raw = str_replace(',', '.', trim((string) $value));
        if (! is_numeric($raw)) {
            return null;
        }

        return $raw;
    }

    private function nullableString(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $raw = trim((string) $value);

        return $raw === '' ? null : $raw;
    }
}
