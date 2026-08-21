<?php

namespace App\Services\FinancialDecision;

use App\Services\FinancialDecision\Dto\FinancialDecision;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Soft Gemini pass: natural wording only. Decision and numbers stay engine-owned.
 */
final class FinancialNarrationService
{
    public function __construct(
        private readonly FinancialReplyFormatter $replies,
    ) {
    }

    public function narrate(FinancialDecision $decision, string $locale, string $mode, string $factsMessage): string
    {
        $fallback = $factsMessage;
        $apiKey = trim((string) config('services.gemini.api_key', ''));
        if ($apiKey === '') {
            return $fallback;
        }

        $ar = $locale === 'ar';
        $facts = $this->buildFactsPayload($decision, $locale, $mode);
        $locked = $this->lockedTokens($facts);

        $system = $ar
            ? 'أنت مستشار مبيعات عقاري داخل نظام Besouhola. مهمتك صياغة رد قصير وواضح لمدير المبيعات.'
            : 'You are a real-estate sales advisor inside Besouhola. Write a short clear reply for a sales manager.';

        $user = implode("\n", [
            $ar
                ? 'أعد صياغة حقائق المحرك التالية بأسلوب طبيعي ومهني.'
                : 'Rewrite the following engine facts in a natural professional tone.',
            $ar
                ? 'قواعد صارمة: لا تغيّر القرار. لا تخترع أرقامًا. انسخ كل الأرقام والنسب كما هي. لا تضف توصيات غير موجودة. بدون Markdown وبدون JSON.'
                : 'Strict rules: do not change the decision. do not invent numbers. copy every figure and percentage exactly. do not add recommendations that are not listed. no markdown and no JSON.',
            $ar
                ? 'اكتب 3 إلى 6 جمل قصيرة، واذكر القرار أولاً ثم السبب ثم الأرقام المهمة ثم البدائل إن وجدت.'
                : 'Write 3 to 6 short sentences. Lead with the decision, then the reason, then key figures, then alternatives if any.',
            '',
            'LOCALE: '.($ar ? 'ar' : 'en'),
            'MODE: '.$mode,
            'ENGINE_FACTS_JSON:',
            json_encode($facts, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            '',
            'ENGINE_FACTS_TEXT:',
            $factsMessage,
        ]);

        try {
            $response = Http::timeout(20)
                ->post($this->geminiUrl($apiKey), [
                    'systemInstruction' => [
                        'parts' => [['text' => $system]],
                    ],
                    'contents' => [[
                        'role' => 'user',
                        'parts' => [['text' => $user]],
                    ]],
                    'generationConfig' => [
                        'temperature' => 0.35,
                        'maxOutputTokens' => 500,
                    ],
                ]);

            if (! $response->successful()) {
                Log::warning('financial.narration.gemini_http_failed', [
                    'status' => $response->status(),
                ]);

                return $fallback;
            }

            $text = trim((string) data_get($response->json(), 'candidates.0.content.parts.0.text', ''));
            $text = $this->sanitize($text);
            if (! $this->isAcceptable($text, (string) $facts['decision_label'], $locked)) {
                Log::info('financial.narration.rejected_output');

                return $fallback;
            }

            return $text;
        } catch (\Throwable $e) {
            Log::warning('financial.narration.exception', [
                'error' => $e->getMessage(),
            ]);

            return $fallback;
        }
    }

    /**
     * @return array<string,mixed>
     */
    private function buildFactsPayload(FinancialDecision $decision, string $locale, string $mode): array
    {
        $ar = $locale === 'ar';
        $metrics = $decision->metrics->toArray();
        $rate = $decision->assumptionsSnapshot['discount_rate'] ?? null;

        $recommendations = [];
        foreach ($decision->recommendations as $item) {
            $line = $this->replies->formatRecommendationLine($item, $ar);
            if ($line !== null) {
                $recommendations[] = [
                    'code' => (string) ($item['code'] ?? ''),
                    'label' => $line,
                    'value' => $this->replies->formatPercent((string) ($item['value'] ?? '0')),
                ];
            }
        }

        return [
            'decision' => $decision->decision,
            'decision_label' => $this->replies->decisionLabel($decision->decision, $ar),
            'reasons' => $this->replies->formatReasons($decision->reasons, $ar),
            'warnings' => $this->replies->formatReasons($decision->warnings, $ar),
            'net_amount' => $this->replies->formatMoney($metrics['net_amount'] ?? '0', $ar),
            'discount_percentage' => $this->replies->formatPercent($metrics['discount_percentage'] ?? '0'),
            'npv' => $this->replies->formatMoney($metrics['npv'] ?? '0', $ar),
            'npv_ratio' => $this->replies->formatRatioAsPercent($metrics['npv_ratio'] ?? '0'),
            'down_payment' => $this->replies->formatPercent($metrics['initial_collection_percentage'] ?? '0'),
            'discount_rate' => ($rate !== null && $rate !== '') ? $this->replies->formatRate((string) $rate) : null,
            'recommendations' => $recommendations,
            'mode' => $mode,
        ];
    }

    /**
     * @param  array<string,mixed>  $facts
     * @return list<string>
     */
    private function lockedTokens(array $facts): array
    {
        $tokens = [];
        foreach ([
            $facts['net_amount'] ?? null,
            $facts['discount_percentage'] ?? null,
            $facts['npv'] ?? null,
            $facts['npv_ratio'] ?? null,
            $facts['down_payment'] ?? null,
            $facts['discount_rate'] ?? null,
        ] as $value) {
            if (is_string($value) && $value !== '') {
                $tokens[] = $value;
            }
        }

        foreach (($facts['recommendations'] ?? []) as $item) {
            $value = (string) ($item['value'] ?? '');
            if ($value !== '') {
                $tokens[] = $value;
            }
        }

        return array_values(array_unique($tokens));
    }

    /**
     * @param  list<string>  $locked
     */
    private function isAcceptable(string $text, string $decisionLabel, array $locked): bool
    {
        if ($text === '' || mb_strlen($text) < 40 || mb_strlen($text) > 1600) {
            return false;
        }

        if ($decisionLabel !== '' && mb_stripos($text, $decisionLabel) === false) {
            return false;
        }

        $hits = 0;
        foreach ($locked as $token) {
            if ($token !== '' && str_contains($text, $token)) {
                $hits++;
            }
        }

        // Require enough engine figures so Gemini cannot invent a parallel story.
        $needed = min(2, count($locked));

        return $hits >= $needed;
    }

    private function sanitize(string $text): string
    {
        $text = preg_replace('/^```(?:\w+)?\s*/u', '', $text) ?? $text;
        $text = preg_replace('/\s*```$/u', '', $text) ?? $text;
        $text = str_replace(["\r\n", "\r"], "\n", $text);
        $text = preg_replace("/\n{3,}/u", "\n\n", $text) ?? $text;

        return trim($text);
    }

    private function geminiUrl(string $apiKey): string
    {
        $model = trim((string) config('services.gemini.model', 'gemini-3.6-flash'));
        if ($model === '') {
            $model = 'gemini-3.6-flash';
        }

        return 'https://generativelanguage.googleapis.com/v1beta/models/'
            .rawurlencode($model)
            .':generateContent?key='
            .urlencode($apiKey);
    }
}
