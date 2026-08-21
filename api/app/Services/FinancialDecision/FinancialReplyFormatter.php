<?php

namespace App\Services\FinancialDecision;

use App\Services\FinancialDecision\Dto\FinancialDecision;

/**
 * Human-facing financial replies and Copilot card payloads.
 * Numbers stay engine-owned; this layer only formats and translates.
 */
final class FinancialReplyFormatter
{
    public function composeMessage(FinancialDecision $decision, string $locale, string $mode = 'evaluate'): string
    {
        $ar = $locale === 'ar';
        $metrics = $decision->metrics->toArray();
        $rate = $decision->assumptionsSnapshot['discount_rate'] ?? null;
        $label = $this->decisionLabel($decision->decision, $ar);
        $reasonLines = $this->formatReasons($decision->reasons, $ar);
        $warningLines = $this->formatReasons($decision->warnings, $ar);
        $paragraphs = [];

        if ($mode === 'max_discount') {
            $max = $this->recommendationValue($decision->recommendations, 'max_discount_percentage');
            $maxMgr = $this->recommendationValue($decision->recommendations, 'max_discount_percentage_with_manager');
            $parts = [];
            if ($max !== null) {
                $parts[] = $ar
                    ? 'أقصى خصم مقبول حسب المحرك '.$this->formatPercent($max)
                    : 'the engine caps an acceptable discount at '.$this->formatPercent($max);
            }
            if ($maxMgr !== null) {
                $parts[] = $ar
                    ? 'ومع موافقة المدير يصل إلى '.$this->formatPercent($maxMgr)
                    : 'and with manager approval up to '.$this->formatPercent($maxMgr);
            }
            if ($parts !== []) {
                $paragraphs[] = $ar
                    ? implode('، ', $parts).'.'
                    : ucfirst(implode(', ', $parts)).'.';
            }
        }

        $lead = $ar
            ? 'العرض '.$label
            : 'The offer is '.$label;
        if ($reasonLines !== []) {
            $lead .= $ar
                ? ' لأن '.implode('، ', $reasonLines)
                : ' because '.implode('; ', $reasonLines);
        }
        $paragraphs[] = $lead.'.';

        if ($warningLines !== []) {
            $paragraphs[] = $ar
                ? 'تنبيه: '.implode('، ', $warningLines).'.'
                : 'Warning: '.implode('; ', $warningLines).'.';
        }

        $figureBits = [
            ($ar ? 'صافي العرض ' : 'net offer ').$this->formatMoney($metrics['net_amount'] ?? '0', $ar),
            ($ar ? 'خصم ' : 'discount ').$this->formatPercent($metrics['discount_percentage'] ?? '0'),
            ($ar ? 'قيمة حالية ' : 'present value ').$this->formatMoney($metrics['npv'] ?? '0', $ar),
            ($ar ? 'نسبة القيمة الحالية ' : 'NPV ratio ').$this->formatRatioAsPercent($metrics['npv_ratio'] ?? '0'),
            ($ar ? 'مقدم ' : 'down payment ').$this->formatPercent($metrics['initial_collection_percentage'] ?? '0'),
        ];
        if ($rate !== null && $rate !== '') {
            $figureBits[] = ($ar ? 'معدل الخصم المالي ' : 'discount rate ').$this->formatRate($rate);
        }
        $paragraphs[] = $ar
            ? 'حسب الأرقام: '.implode('، ', $figureBits).'.'
            : 'On the figures: '.implode(', ', $figureBits).'.';

        if ($mode !== 'max_discount' && $decision->recommendations !== []) {
            $alts = [];
            foreach ($decision->recommendations as $item) {
                $line = $this->formatRecommendationLine($item, $ar);
                if ($line !== null) {
                    $alts[] = $line;
                }
            }
            if ($alts !== []) {
                $paragraphs[] = $ar
                    ? 'عشان العرض يعدي حسب المحرك: '.implode('، ', $alts).'.'
                    : 'To clear the engine: '.implode('; ', $alts).'.';
            }
        }

        return implode("\n\n", $paragraphs);
    }

    /**
     * @return array<string,mixed>
     */
    public function cardAction(FinancialDecision $decision, string $locale, string $mode = 'evaluate'): array
    {
        $ar = $locale === 'ar';
        $metrics = $decision->metrics->toArray();
        $rate = $decision->assumptionsSnapshot['discount_rate'] ?? null;

        $metricRows = [
            [
                'label' => $ar ? 'صافي العرض' : 'Net offer',
                'value' => $this->formatMoney($metrics['net_amount'] ?? '0', $ar),
            ],
            [
                'label' => $ar ? 'الخصم' : 'Discount',
                'value' => $this->formatPercent($metrics['discount_percentage'] ?? '0'),
            ],
            [
                'label' => $ar ? 'القيمة الحالية (NPV)' : 'Present value (NPV)',
                'value' => $this->formatMoney($metrics['npv'] ?? '0', $ar),
            ],
            [
                'label' => $ar ? 'نسبة القيمة الحالية' : 'NPV ratio',
                'value' => $this->formatRatioAsPercent($metrics['npv_ratio'] ?? '0'),
            ],
            [
                'label' => $ar ? 'المقدم' : 'Down payment',
                'value' => $this->formatPercent($metrics['initial_collection_percentage'] ?? '0'),
            ],
        ];

        if ($rate !== null && $rate !== '') {
            $metricRows[] = [
                'label' => $ar ? 'معدل الخصم المالي' : 'Discount rate',
                'value' => $this->formatRate($rate),
            ];
        }

        $recommendations = [];
        foreach ($decision->recommendations as $item) {
            $line = $this->formatRecommendationLine($item, $ar);
            if ($line !== null) {
                $recommendations[] = [
                    'code' => (string) ($item['code'] ?? ''),
                    'label' => $line,
                    'value' => $this->formatPercent((string) ($item['value'] ?? '0')),
                ];
            }
        }

        return [
            'type' => 'financial_decision_card',
            'mode' => $mode,
            'locale' => $ar ? 'ar' : 'en',
            'decision' => $decision->decision,
            'decision_label' => $this->decisionLabel($decision->decision, $ar),
            'tone' => $this->decisionTone($decision->decision),
            'headline' => $mode === 'max_discount'
                ? ($ar ? 'أقصى خصم حسب المحرك' : 'Maximum discount from engine')
                : ($ar ? 'تقييم العرض التجاري' : 'Commercial offer evaluation'),
            'labels' => [
                'decision' => $ar ? 'القرار' : 'Decision',
                'reason' => $ar ? 'السبب' : 'Reason',
                'warning' => $ar ? 'تنبيه' : 'Warning',
                'alternatives' => $ar ? 'بدائل من المحرك' : 'Engine alternatives',
            ],
            'reasons' => $this->formatReasons($decision->reasons, $ar),
            'warnings' => $this->formatReasons($decision->warnings, $ar),
            'metrics' => $metricRows,
            'recommendations' => $recommendations,
            'footer' => $ar
                ? 'الأرقام صادرة من محرك القرار المالي، والصياغة فقط بمساعدة المساعد.'
                : 'Figures come from the financial decision engine; wording may be assisted.',
        ];
    }

    public function decisionLabel(string $decision, bool $ar): string
    {
        return match ($decision) {
            'approved' => $ar ? 'مقبول' : 'Approved',
            'approved_with_warning' => $ar ? 'مقبول مع تحذير' : 'Approved with warning',
            'manager_approval_required' => $ar ? 'يحتاج موافقة المدير' : 'Manager approval required',
            'rejected' => $ar ? 'مرفوض' : 'Rejected',
            'invalid' => $ar ? 'بيانات غير صالحة' : 'Invalid input',
            default => $ar ? 'ناقص بيانات' : 'Incomplete',
        };
    }

    public function decisionTone(string $decision): string
    {
        return match ($decision) {
            'approved', 'approved_with_warning' => 'success',
            'manager_approval_required' => 'warning',
            'rejected', 'invalid' => 'danger',
            default => 'neutral',
        };
    }

    /**
     * @param  list<string>  $codes
     * @return list<string>
     */
    public function formatReasons(array $codes, bool $ar): array
    {
        $out = [];
        foreach ($codes as $code) {
            $label = $this->reasonLabel((string) $code, $ar);
            if ($label !== '') {
                $out[] = $label;
            }
        }

        return $out;
    }

    public function reasonLabel(string $code, bool $ar): string
    {
        return match ($code) {
            'discount_exceeds_maximum' => $ar
                ? 'الخصم أعلى من الحد الأقصى المسموح'
                : 'Discount exceeds the maximum allowed',
            'discount_exceeds_standard_policy' => $ar
                ? 'الخصم أعلى من الحد الاعتيادي ويحتاج موافقة المدير'
                : 'Discount exceeds the standard policy and needs manager approval',
            'discount_at_policy_limit' => $ar
                ? 'الخصم عند الحد الأقصى للسياسة'
                : 'Discount is at the policy limit',
            'npv_below_minimum' => $ar
                ? 'القيمة الحالية أقل من الحد الأدنى المطلوب'
                : 'Present value is below the minimum required',
            'initial_collection_below_minimum' => $ar
                ? 'المقدم أقل من الحد الأدنى المطلوب'
                : 'Down payment is below the minimum required',
            'duration_exceeds_maximum' => $ar
                ? 'مدة التقسيط أطول من الحد الأقصى المسموح'
                : 'Installment duration exceeds the maximum allowed',
            'financial_assumptions_missing' => $ar
                ? 'معدل الخصم المالي غير مضبوط بعد من إعدادات المستأجر'
                : 'Financial discount rate is not configured yet',
            'financial_policy_missing' => $ar
                ? 'سياسة القرار المالي غير مضبوطة بعد'
                : 'Financial decision policy is not configured yet',
            'gross_amount_missing' => $ar
                ? 'سعر الوحدة أو مبلغ العرض غير موجود'
                : 'Unit price or offer amount is missing',
            'payment_schedule_missing' => $ar
                ? 'خطة السداد غير مكتملة'
                : 'Payment schedule is incomplete',
            'schedule_does_not_balance' => $ar
                ? 'مجموع الدفعات لا يساوي صافي العرض'
                : 'Installments do not balance to the net offer',
            'lead_not_visible' => $ar
                ? 'الليد غير ظاهر ضمن صلاحياتك'
                : 'Lead is not visible in your scope',
            'invalid_input' => $ar
                ? 'البيانات المدخلة غير صالحة'
                : 'The provided input is invalid',
            'incomplete_input' => $ar
                ? 'البيانات غير كافية لإكمال التقييم'
                : 'Not enough data to complete the evaluation',
            'not_implemented' => $ar
                ? 'هذا الوضع غير مفعّل بعد'
                : 'This mode is not implemented yet',
            'reverse_calc_unavailable' => $ar
                ? 'تعذر حساب البدائل على هذه البيانات'
                : 'Could not compute alternatives for this input',
            'net_amount_invalid', 'start_date_invalid', 'allocation_amount_missing', 'cash_flow_empty' => $ar
                ? 'تعذر بناء جدول التدفقات النقدية'
                : 'Could not build the cash-flow schedule',
            default => $code === '' ? '' : ($ar ? str_replace('_', ' ', $code) : str_replace('_', ' ', $code)),
        };
    }

    /**
     * @param  array<string,mixed>  $item
     */
    public function formatRecommendationLine(array $item, bool $ar): ?string
    {
        $code = (string) ($item['code'] ?? '');
        $value = $this->formatPercent((string) ($item['value'] ?? ''));
        if ($code === '' || $value === '') {
            return null;
        }

        return match ($code) {
            'max_discount_percentage' => $ar
                ? "أقصى خصم مقبول: {$value}"
                : "Maximum acceptable discount: {$value}",
            'max_discount_percentage_with_manager' => $ar
                ? "أقصى خصم بموافقة المدير: {$value}"
                : "Maximum discount with manager approval: {$value}",
            'min_down_payment_percentage' => $ar
                ? "أقل مقدم مقبول: {$value}"
                : "Minimum acceptable down payment: {$value}",
            default => $ar ? "{$code}: {$value}" : "{$code}: {$value}",
        };
    }

    /**
     * @param  list<array<string,mixed>>  $recommendations
     */
    public function recommendationValue(array $recommendations, string $code): ?string
    {
        foreach ($recommendations as $item) {
            if (($item['code'] ?? '') === $code) {
                return (string) ($item['value'] ?? '');
            }
        }

        return null;
    }

    public function formatMoney(string $amount, bool $ar = false): string
    {
        $raw = Money::roundHalfUp($amount, 2);
        $formatted = number_format((float) $raw, 2, '.', ',');

        return $ar ? $formatted.' ج.م' : $formatted.' EGP';
    }

    public function formatPercent(string $value): string
    {
        $rounded = Money::roundHalfUp($value, 2);
        $trimmed = rtrim(rtrim($rounded, '0'), '.');
        if ($trimmed === '' || $trimmed === '-') {
            $trimmed = '0';
        }

        return $trimmed.'%';
    }

    public function formatRatioAsPercent(string $ratio): string
    {
        return $this->formatPercent(Money::mul(Money::of($ratio), '100'));
    }

    public function formatRate(string $rate): string
    {
        return $this->formatPercent(Money::mul(Money::of($rate), '100'));
    }
}
