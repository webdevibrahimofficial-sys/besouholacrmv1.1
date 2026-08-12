<?php

namespace App\Services\AiCopilot;

class CopilotNotificationPreviewBuilder
{
    public function build(array $payload, string $locale = 'en', ?string $type = null): string
    {
        $facts = is_array($payload['facts'] ?? null) ? $payload['facts'] : [];
        $recommendations = is_array($payload['recommendations'] ?? null) ? $payload['recommendations'] : [];
        $leadName = trim((string) ($payload['lead_name'] ?? ''));
        if ($leadName === '') {
            $leadName = 'Lead #'.((int) ($payload['lead_id'] ?? 0));
        }

        $type = $type ?? (string) ($payload['meta']['notification_type'] ?? CopilotNotificationTimeBucket::TYPE_LEAD_INTELLIGENCE);
        $isRescue = $type === CopilotNotificationTimeBucket::TYPE_LEAD_RESCUE;
        $isEscalation = $type === CopilotNotificationTimeBucket::TYPE_ESCALATION;
        $isLostDetective = $type === CopilotNotificationTimeBucket::TYPE_LOST_DETECTIVE;

        $risk = strtolower((string) ($facts['risk_level'] ?? 'medium'));
        $riskLabel = $this->riskLabel($risk, $locale);
        $riskIcon = match ($risk) {
            'high', 'critical' => '🔴',
            'medium' => '🟡',
            default => '🟢',
        };

        $lines = [];
        $detailParts = [];

        if ($isLostDetective) {
            $detective = is_array($facts['detective'] ?? null) ? $facts['detective'] : [];
            $lines[] = '🕵️ '.$leadName.' — '.($locale === 'ar' ? 'تحليل الخسارة' : 'Loss analysis');
            if (! empty($detective['hypothesis'])) {
                $detailParts[] = (string) $detective['hypothesis'];
            }
        } elseif ($isEscalation) {
            $escalation = is_array($facts['escalation'] ?? null) ? $facts['escalation'] : [];
            $repName = trim((string) ($escalation['assigned_user_name'] ?? ''));
            $suffix = $repName !== ''
                ? ($locale === 'ar' ? " — {$repName}" : " — {$repName}")
                : '';
            $lines[] = '⚠️ '.$leadName.$suffix.' — '.($locale === 'ar' ? 'تصعيد للمدير' : 'Manager escalation');
        } elseif ($isRescue) {
            $lines[] = '🆘 '.$leadName.' — '.($locale === 'ar' ? 'يحتاج إنقاذ' : 'Needs rescue');
        } else {
            $lines[] = "{$riskIcon} {$leadName} — ".($locale === 'ar' ? 'المخاطر' : 'Risk').": {$riskLabel}";
        }

        if (! $isLostDetective) {
        if (! empty($facts['proposal_sent'])) {
            $hours = (int) ($facts['last_contact_hours'] ?? 0);
            if (empty($facts['followup_done'])) {
                $detailParts[] = $locale === 'ar'
                    ? 'تم إرسال عرض · '.($hours > 0 ? "{$hours}س بدون متابعة" : 'بدون متابعة')
                    : 'Proposal sent · '.($hours > 0 ? "{$hours}h no follow-up" : 'no follow-up');
            } else {
                $detailParts[] = $locale === 'ar' ? 'تم إرسال عرض' : 'Proposal sent';
            }
        } elseif ((int) ($facts['last_contact_hours'] ?? 0) > 24) {
            $hours = (int) $facts['last_contact_hours'];
            $detailParts[] = $locale === 'ar'
                ? "آخر تواصل من {$hours} ساعة"
                : "Last contact {$hours}h ago";
        }

        if ((int) ($facts['no_answer_count'] ?? 0) > 0) {
            $count = (int) $facts['no_answer_count'];
            $detailParts[] = $locale === 'ar'
                ? "{$count} محاولة بدون رد"
                : "{$count} no-answer";
        }

        if (! empty($facts['delayed'])) {
            $detailParts[] = $locale === 'ar' ? 'متابعة متأخرة' : 'Delayed follow-up';
        }

        $escalation = is_array($facts['escalation'] ?? null) ? $facts['escalation'] : [];
        if ($isEscalation && ! empty($escalation['reason'])) {
            $detailParts[] = (string) $escalation['reason'];
        }

        $assignment = is_array($facts['assignment'] ?? null) ? $facts['assignment'] : [];
        if (! empty($assignment['is_unassigned'])) {
            $detailParts[] = $locale === 'ar' ? 'غير مسند' : 'Unassigned';
            $suggested = is_array($assignment['suggested_assignee'] ?? null) ? $assignment['suggested_assignee'] : null;
            if ($suggested && ! empty($suggested['name'])) {
                $detailParts[] = $locale === 'ar'
                    ? 'اقتراح: '.$suggested['name']
                    : 'Suggest: '.$suggested['name'];
            }
        }
        }

        if ($detailParts !== []) {
            $lines[] = implode(' · ', $detailParts);
        }

        $action = $this->primaryActionLabel($recommendations, $locale);
        if ($action !== '') {
            $lines[] = '→ '.$action;
        }

        return implode("\n", $lines);
    }

    protected function riskLabel(string $risk, string $locale): string
    {
        return match ($risk) {
            'high', 'critical' => $locale === 'ar' ? 'مرتفع' : 'High',
            'low' => $locale === 'ar' ? 'منخفض' : 'Low',
            default => $locale === 'ar' ? 'متوسط' : 'Medium',
        };
    }

    protected function primaryActionLabel(array $recommendations, string $locale): string
    {
        $action = strtolower((string) ($recommendations['primary_action'] ?? ''));
        $channel = strtolower((string) ($recommendations['best_channel'] ?? ''));

        return match (true) {
            $action === 'learn_from_loss' || str_contains($action, 'detective') => $locale === 'ar' ? 'تعلّم من الخسارة' : 'Learn from loss',
            $action === 'manager_intervention' || str_contains($action, 'escalat') => $locale === 'ar' ? 'تدخل المدير' : 'Manager intervention',
            $action === 'assign_lead' || str_contains($action, 'assign') => $locale === 'ar' ? 'إسناد لسيلز' : 'Assign to sales',
            str_contains($action, 'whatsapp') || $channel === 'whatsapp' => $locale === 'ar' ? 'متابعة واتساب' : 'WhatsApp follow-up',
            str_contains($action, 'call') || $channel === 'call' => $locale === 'ar' ? 'مكالمة متابعة' : 'Call follow-up',
            str_contains($action, 'meeting') || $channel === 'meeting' => $locale === 'ar' ? 'ترتيب اجتماع' : 'Schedule meeting',
            default => $locale === 'ar' ? 'متابعة' : 'Follow up',
        };
    }
}
