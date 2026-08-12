<?php

namespace App\Services\AiCopilot;

use Illuminate\Support\Facades\Http;

class CopilotLeadNarrationService
{
    public function render(array $payload, string $locale = 'en'): array
    {
        $template = $this->renderTemplate($payload, $locale);
        $apiKey = (string) config('services.gemini.api_key', '');

        if ($apiKey === '') {
            return [
                'content' => $template,
                'source' => 'template',
            ];
        }

        $factsJson = json_encode($payload['facts'] ?? [], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        $signalsJson = json_encode($payload['signals'] ?? [], JSON_UNESCAPED_UNICODE);
        $recommendationsJson = json_encode($payload['recommendations'] ?? [], JSON_UNESCAPED_UNICODE);
        $leadName = (string) ($payload['lead_name'] ?? '');
        $replyLanguage = $locale === 'ar' ? 'Arabic' : 'English';

        $prompt = <<<PROMPT
You are Besouhola Copilot. Write a Lead Intelligence card in {$replyLanguage}.
Use ONLY the JSON facts below. Do not invent numbers, percentages, or events.
Plain text only. No markdown. Structure:

Title line with lead name
Risk and Intent lines with emoji (🔴🟡🟢)
Why? section with bullet lines starting with •
Do now section (one line)
Suggested message section (quoted text)

Facts JSON:
{$factsJson}

Signals JSON:
{$signalsJson}

Recommendations JSON:
{$recommendationsJson}

Lead name: {$leadName}
PROMPT;

        try {
            $response = Http::timeout(20)->post($this->geminiUrl($apiKey), [
                'contents' => [[
                    'role' => 'user',
                    'parts' => [['text' => $prompt]],
                ]],
            ]);

            if (! $response->successful()) {
                return ['content' => $template, 'source' => 'template'];
            }

            $text = trim((string) data_get($response->json(), 'candidates.0.content.parts.0.text', ''));

            return [
                'content' => $text !== '' ? $text : $template,
                'source' => $text !== '' ? 'gemini' : 'template',
            ];
        } catch (\Throwable) {
            return ['content' => $template, 'source' => 'template'];
        }
    }

    protected function renderTemplate(array $payload, string $locale): string
    {
        $facts = is_array($payload['facts'] ?? null) ? $payload['facts'] : [];
        $recommendations = is_array($payload['recommendations'] ?? null) ? $payload['recommendations'] : [];
        $leadName = trim((string) ($payload['lead_name'] ?? ''));
        $risk = (string) ($facts['risk_level'] ?? 'medium');
        $intent = (string) ($facts['intent_level'] ?? 'medium');

        $riskLine = ($locale === 'ar' ? '🔴 المخاطر: ' : '🔴 Risk: ')
            .$this->levelLabel($risk, $locale);
        $intentLine = ($locale === 'ar' ? '🟢 الاهتمام: ' : '🟢 Intent: ')
            .$this->levelLabel($intent, $locale);

        $escalation = is_array($facts['escalation'] ?? null) ? $facts['escalation'] : [];
        $detective = is_array($facts['detective'] ?? null) ? $facts['detective'] : [];
        $why = [];
        if (! empty($facts['proposal_sent'])) {
            $why[] = $locale === 'ar' ? '• تم إرسال عرض' : '• Proposal sent';
        }
        if (! empty($facts['proposal_sent']) && empty($facts['followup_done'])) {
            $hours = (int) ($facts['last_contact_hours'] ?? 0);
            $why[] = $locale === 'ar'
                ? '• '.($hours > 0 ? "{$hours} ساعة" : 'فترة').' بدون متابعة بعد العرض'
                : '• '.($hours > 0 ? "{$hours}h" : 'Time').' without follow-up after proposal';
        }
        if ((int) ($facts['no_answer_count'] ?? 0) > 0) {
            $why[] = $locale === 'ar'
                ? '• '.(int) $facts['no_answer_count'].' محاولات بدون رد'
                : '• '.(int) $facts['no_answer_count'].' no-answer attempts';
        }
        if (! empty($facts['delayed'])) {
            $why[] = $locale === 'ar' ? '• متابعة متأخرة' : '• Delayed follow-up';
        }
        if (! empty($detective['cancel_reason'])) {
            $why[] = $locale === 'ar'
                ? '• سبب الإلغاء: '.(string) $detective['cancel_reason']
                : '• Cancel reason: '.(string) $detective['cancel_reason'];
        }
        if (! empty($detective['hypothesis'])) {
            $why[] = '• '.(string) $detective['hypothesis'];
        }
        if ((int) ($detective['similar_won_count'] ?? 0) > 0) {
            $why[] = $locale === 'ar'
                ? '• '.(int) $detective['similar_won_count'].' ليدز مشابهة نجحت من نفس المصدر'
                : '• '.(int) $detective['similar_won_count'].' similar leads won from same source';
        }
        if (! empty($escalation['assigned_user_name'])) {
            $why[] = $locale === 'ar'
                ? '• مسند إلى '.(string) $escalation['assigned_user_name']
                : '• Assigned to '.(string) $escalation['assigned_user_name'];
        }
        if (! empty($escalation['reason'])) {
            $why[] = '• '.(string) $escalation['reason'];
        }
        $assignment = is_array($facts['assignment'] ?? null) ? $facts['assignment'] : [];
        if (! empty($assignment['is_unassigned'])) {
            $why[] = $locale === 'ar' ? '• الليد غير مسند لأي سيلز' : '• Lead is not assigned to sales';
            if (! empty($assignment['advice'])) {
                $why[] = '• '.(string) $assignment['advice'];
            }
        }
        if ($why === []) {
            $why[] = $locale === 'ar' ? '• لا توجد إشارات حرجة حالياً' : '• No critical signals right now';
        }

        $channel = (string) ($recommendations['best_channel'] ?? 'call');
        $primaryAction = strtolower((string) ($recommendations['primary_action'] ?? ''));
        if ($primaryAction === 'manager_intervention' && ! empty($escalation['advice'])) {
            $doNow = (string) $escalation['advice'];
        } elseif ($primaryAction === 'learn_from_loss' && ! empty($detective['lesson'])) {
            $doNow = (string) $detective['lesson'];
        } elseif ($primaryAction === 'assign_lead') {
            $doNow = (string) ($recommendations['assignment_advice'] ?? ($locale === 'ar' ? 'إسناد الليد لسيلز' : 'Assign lead to sales'));
        } else {
            $doNow = $locale === 'ar'
                ? 'متابعة عبر '.$this->channelLabel($channel, $locale)
                : ucfirst($channel).' follow-up';
        }

        $window = trim((string) ($recommendations['best_time_window'] ?? ''));
        if ($window !== '') {
            $doNow .= $locale === 'ar' ? " ({$window})" : " ({$window})";
        }

        $message = (string) ($recommendations['message_draft'] ?? '');
        $notificationType = (string) ($payload['meta']['notification_type'] ?? '');
        $isRescue = $notificationType === CopilotNotificationTimeBucket::TYPE_LEAD_RESCUE;
        $isEscalation = $notificationType === CopilotNotificationTimeBucket::TYPE_ESCALATION;
        $isLostDetective = $notificationType === CopilotNotificationTimeBucket::TYPE_LOST_DETECTIVE;

        $titleLine = match (true) {
            $isLostDetective => '🕵️ '.($locale === 'ar' ? 'محقق الليد الخاسر — ' : 'Lost Lead Detective — ').$leadName,
            $isEscalation => '⚠️ '.($locale === 'ar' ? 'تصعيد للمدير — ' : 'Manager Escalation — ').$leadName,
            $isRescue => '🆘 '.($locale === 'ar' ? 'إنقاذ الليد — ' : 'Lead Rescue — ').$leadName,
            default => '🧠 '.($locale === 'ar' ? 'ذكاء الليد — ' : 'Lead Intelligence — ').$leadName,
        };

        $lines = [
            $titleLine,
            '',
            $riskLine,
            $intentLine,
            '',
            $locale === 'ar' ? 'لماذا؟' : 'Why?',
            ...$why,
            '',
            $locale === 'ar' ? 'ماذا تفعل الآن؟' : 'Do now',
            $doNow,
            '',
            $locale === 'ar' ? '✉ الرسالة المقترحة' : '✉ Suggested message',
            '"'.$message.'"',
        ];

        $audience = is_array($payload['audience'] ?? null) ? $payload['audience'] : [];
        if (($audience['role_view'] ?? '') === 'manager' && ! empty($recommendations['manager_note'])) {
            $lines[] = '';
            $lines[] = $locale === 'ar' ? '👤 ملاحظة للمدير' : '👤 Manager note';
            $lines[] = (string) $recommendations['manager_note'];
        }

        return implode("\n", $lines);
    }

    protected function levelLabel(string $level, string $locale): string
    {
        return match (strtolower($level)) {
            'high', 'critical' => $locale === 'ar' ? 'مرتفع' : 'High',
            'low' => $locale === 'ar' ? 'منخفض' : 'Low',
            default => $locale === 'ar' ? 'متوسط' : 'Medium',
        };
    }

    protected function channelLabel(string $channel, string $locale): string
    {
        return match (strtolower($channel)) {
            'whatsapp' => 'WhatsApp',
            'meeting' => $locale === 'ar' ? 'اجتماع' : 'Meeting',
            default => $locale === 'ar' ? 'مكالمة' : 'Call',
        };
    }

    protected function geminiUrl(string $apiKey): string
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
