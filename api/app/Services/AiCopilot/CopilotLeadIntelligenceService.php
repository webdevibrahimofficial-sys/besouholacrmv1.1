<?php

namespace App\Services\AiCopilot;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;

class CopilotLeadIntelligenceService
{
    public function __construct(
        private readonly CopilotAudienceResolver $audience,
        private readonly CopilotLeadAssigneeResolver $assigneeResolver,
    ) {
    }

    public function analyze(User $user, Lead $lead, string $locale = 'en', string $source = 'copilot'): array
    {
        if (! $this->audience->canView($user, $lead)) {
            return [
                'ok' => false,
                'reason' => 'not_visible',
            ];
        }

        $audience = $this->audience->resolve($user, $lead);
        $actions = $this->loadRecentActions($lead);
        $assignment = $this->assigneeResolver->resolveAssignmentAdvice($user, $lead, $locale);
        $facts = $this->buildFacts($lead, $actions, $assignment);
        $signals = $this->buildSignals($facts, $assignment);
        $recommendations = $this->buildRecommendations($facts, $audience, $locale, $assignment);
        $severity = $this->severityFromRisk((string) ($facts['risk_level'] ?? 'medium'));

        $leadName = trim((string) ($lead->name ?? ''));
        if ($leadName === '') {
            $leadName = 'Lead #'.$lead->id;
        }

        $payload = [
            'lead_id' => (int) $lead->id,
            'lead_name' => $leadName,
            'audience' => $audience,
            'facts' => $facts,
            'recommendations' => $recommendations,
            'signals' => $signals,
            'meta' => [
                'source' => $source,
                'generated_at' => now()->toIso8601String(),
                'facts_version' => 1,
                'locale' => $locale,
            ],
        ];

        return [
            'ok' => true,
            'lead_id' => (int) $lead->id,
            'lead_name' => $leadName,
            'severity' => $severity,
            'title' => $locale === 'ar'
                ? "ذكاء الليد — {$leadName}"
                : "Lead Intelligence — {$leadName}",
            'payload' => $payload,
            'ui_actions' => $this->buildUiActions($lead, $payload, $locale, $assignment),
        ];
    }

    public function buildUiActionsFromPayload(User $user, array $payload, string $locale = 'en'): array
    {
        $leadId = (int) ($payload['lead_id'] ?? 0);
        if ($leadId <= 0) {
            return [];
        }

        $lead = Lead::query()->find($leadId);
        if (! $lead || ! $this->audience->canView($user, $lead)) {
            return [];
        }

        return $this->buildUiActions(
            $lead,
            $payload,
            $locale,
            is_array($payload['assignment'] ?? null) ? $payload['assignment'] : (is_array($payload['facts']['assignment'] ?? null) ? $payload['facts']['assignment'] : [])
        );
    }

    public function buildUiActionsForLead(Lead $lead, array $payload, string $locale = 'en'): array
    {
        $assignment = is_array($payload['facts']['assignment'] ?? null)
            ? $payload['facts']['assignment']
            : (is_array($payload['assignment'] ?? null) ? $payload['assignment'] : []);

        return $this->buildUiActions($lead, $payload, $locale, $assignment);
    }

    /**
     * @return array<int, LeadAction>
     */
    protected function loadRecentActions(Lead $lead): array
    {
        if (! Schema::hasTable('lead_actions')) {
            return [];
        }

        return LeadAction::query()
            ->where('lead_id', $lead->id)
            ->orderByDesc('created_at')
            ->limit(40)
            ->get()
            ->all();
    }

    /**
     * @param  array<int, LeadAction>  $actions
     */
    protected function buildFacts(Lead $lead, array $actions, array $assignment = []): array
    {
        $now = now();
        $lastAction = $actions[0] ?? null;
        $lastContactHours = $lastAction
            ? (int) $lastAction->created_at?->diffInHours($now)
            : null;

        $noAnswerCount = 0;
        $proposalSent = false;
        $followupAfterProposal = false;
        $lastChannel = 'call';
        $delayed = false;
        $replyHours = [];

        $proposalAt = null;
        foreach ($actions as $index => $action) {
            $details = is_array($action->details) ? $action->details : [];
            $type = strtolower((string) ($action->action_type ?? ''));
            $outcome = strtolower((string) ($details['outcome'] ?? $details['answerStatus'] ?? ''));
            $stage = strtolower((string) ($lead->stage ?? ''));
            $description = strtolower((string) ($action->description ?? ''));

            if ($index === 0) {
                $lastChannel = in_array($type, ['whatsapp', 'meeting', 'call', 'comment'], true) ? $type : 'call';
            }

            if (in_array($outcome, ['no_answer', 'no answer', 'no-answer'], true)) {
                $noAnswerCount++;
            }

            if (
                str_contains($type, 'proposal')
                || str_contains($stage, 'proposal')
                || str_contains($description, 'proposal')
                || str_contains($description, 'عرض')
            ) {
                $proposalSent = true;
                if ($proposalAt === null) {
                    $proposalAt = $action->created_at;
                }
            }

            if ($action->created_at) {
                $replyHours[] = (int) $action->created_at->format('G');
            }

            $status = strtolower((string) ($details['status'] ?? ''));
            $date = trim((string) ($details['date'] ?? ''));
            if (in_array($status, ['scheduled', 'pending', 'in_progress', 'in-progress'], true) && $date !== '') {
                try {
                    $due = Carbon::parse($date.' '.($details['time'] ?? '23:59'));
                    if ($due->isPast()) {
                        $delayed = true;
                    }
                } catch (\Throwable) {
                }
            }
        }

        if ($proposalAt !== null) {
            foreach ($actions as $action) {
                if ($action->created_at && $action->created_at->gt($proposalAt)) {
                    $followupAfterProposal = true;
                    break;
                }
            }
        }

        $bestChannel = $noAnswerCount >= 2 && $lastChannel === 'call' ? 'whatsapp' : $lastChannel;
        $bestTimeWindow = $this->bestTimeWindow($replyHours);

        $riskScore = 0;
        if ($delayed) {
            $riskScore += 3;
        }
        if ($proposalSent && ! $followupAfterProposal && ($lastContactHours ?? 0) >= 24) {
            $riskScore += 4;
        }
        if ($noAnswerCount >= 2) {
            $riskScore += 2;
        }
        if (($lastContactHours ?? 0) >= 72) {
            $riskScore += 2;
        }
        if (! empty($assignment['is_unassigned'])) {
            $riskScore += 3;
        }

        $intentScore = 0;
        if ($proposalSent) {
            $intentScore += 2;
        }
        if ($noAnswerCount > 0 && $noAnswerCount < 3) {
            $intentScore += 1;
        }
        if (! $delayed && ($lastContactHours ?? 999) <= 48) {
            $intentScore += 1;
        }

        return [
            'last_contact_hours' => $lastContactHours,
            'proposal_sent' => $proposalSent,
            'followup_done' => $followupAfterProposal,
            'no_answer_count' => $noAnswerCount,
            'delayed' => $delayed,
            'last_channel' => $lastChannel,
            'best_channel' => $bestChannel,
            'best_time_window' => $bestTimeWindow,
            'risk_level' => $this->levelFromScore($riskScore, [2 => 'medium', 4 => 'high']),
            'intent_level' => $this->levelFromScore($intentScore, [1 => 'medium', 3 => 'high']),
            'stage' => (string) ($lead->stage ?? ''),
            'assigned_to' => (int) ($lead->assigned_to ?? 0),
            'is_assigned' => (int) ($lead->assigned_to ?? 0) > 0,
            'assignment' => $assignment,
        ];
    }

    protected function buildSignals(array $facts, array $assignment = []): array
    {
        $signals = [];
        if (! empty($assignment['is_unassigned'])) {
            $signals[] = ['code' => 'unassigned_lead', 'weight' => 4];
        }
        if (! empty($facts['proposal_sent']) && empty($facts['followup_done'])) {
            $signals[] = ['code' => 'proposal_no_followup', 'weight' => 3];
        }
        if ((int) ($facts['no_answer_count'] ?? 0) >= 2) {
            $signals[] = ['code' => 'no_answer_streak', 'weight' => 2];
        }
        if (! empty($facts['delayed'])) {
            $signals[] = ['code' => 'delayed_followup', 'weight' => 3];
        }
        if ((int) ($facts['last_contact_hours'] ?? 0) >= 72) {
            $signals[] = ['code' => 'stale_contact', 'weight' => 2];
        }

        return $signals;
    }

    protected function buildRecommendations(array $facts, array $audience, string $locale, array $assignment = []): array
    {
        $channel = (string) ($facts['best_channel'] ?? 'call');
        $suggested = is_array($assignment['suggested_assignee'] ?? null) ? $assignment['suggested_assignee'] : null;

        if (! empty($assignment['is_unassigned']) && ! empty($assignment['can_assign']) && $suggested) {
            $primaryAction = 'assign_lead';
        } else {
            $primaryAction = match ($channel) {
                'whatsapp' => 'whatsapp_follow_up',
                'meeting' => 'schedule_meeting',
                default => 'call_follow_up',
            };
        }

        $leadName = trim((string) ($facts['lead_name'] ?? ''));
        $messageDraft = $locale === 'ar'
            ? "أهلاً {$leadName}، بتابع معاك بخصوص آخر تواصل. لو مناسب، نكمل النقطة اللي فاتت."
            : "Hi {$leadName}, following up on our last conversation. Let me know if now is a good time to continue.";

        if (! empty($facts['proposal_sent']) && empty($facts['followup_done'])) {
            $messageDraft = $locale === 'ar'
                ? "أهلاً {$leadName}، حبيت أتابع معاك بخصوص العرض اللي اتبعت. تحب نراجع أي نقطة أو نحدد خطوة جاية؟"
                : "Hi {$leadName}, checking in about the proposal we shared. Happy to clarify anything or agree on a next step.";
        }

        return [
            'primary_action' => $primaryAction,
            'best_channel' => $channel,
            'best_time_window' => (string) ($facts['best_time_window'] ?? ''),
            'message_draft' => $messageDraft,
            'suggested_stage' => 'follow_up',
            'assignment_advice' => $assignment['advice'] ?? null,
            'suggested_assignee' => $suggested,
            'manager_note' => ($audience['role_view'] ?? '') === 'manager'
                ? ($locale === 'ar' ? 'تابع مع السيلز المسؤول إذا استمر التأخير.' : 'Follow up with the assigned rep if delay continues.')
                : null,
        ];
    }

    protected function buildUiActions(Lead $lead, array $payload, string $locale, array $assignment = []): array
    {
        $leadId = (int) $lead->id;
        $leadName = trim((string) ($payload['lead_name'] ?? $lead->name ?? ''));
        $channel = strtolower((string) ($payload['recommendations']['best_channel'] ?? 'call'));
        $suggested = is_array($assignment['suggested_assignee'] ?? null) ? $assignment['suggested_assignee'] : null;

        $actions = [];

        if (! empty($assignment['is_unassigned']) && ! empty($assignment['can_assign']) && $suggested) {
            $assigneeName = trim((string) ($suggested['name'] ?? ''));
            $assigneeId = (int) ($suggested['user_id'] ?? 0);
            $actions[] = [
                'type' => 'open_assign_modal',
                'action' => 'assign_lead',
                'payload' => [
                    'lead_id' => $leadId,
                    'lead_name' => $leadName,
                    'assigned_to' => $assigneeId,
                    'assigned_to_name' => $assigneeName,
                    'suggested_user_id' => $assigneeId,
                    'suggested_user_name' => $assigneeName,
                ],
                'label' => $locale === 'ar'
                    ? '👤 إسناد الليد'
                    : '👤 Assign lead',
            ];
        }

        $actions = array_merge($actions, [
            [
                'type' => 'prompt_message',
                'message' => 'start an action on lead '.$leadId,
                'display_text' => $locale === 'ar' ? '💬 ابدأ أكشن' : '💬 Start action',
                'label' => $locale === 'ar' ? 'ابدأ أكشن' : 'Start action',
            ],
            [
                'type' => 'navigate',
                'path' => '/leads?lead_id='.$leadId.'&tab=all-actions',
                'pathname' => '/leads',
                'search' => '?lead_id='.$leadId.'&tab=all-actions',
                'label' => $locale === 'ar' ? '📋 فتح الليد' : '📋 Open lead',
            ],
            [
                'type' => 'confirm_action',
                'action' => 'create_task_for_lead',
                'payload' => [
                    'lead_id' => $leadId,
                    'title' => $locale === 'ar'
                        ? 'متابعة '.$leadName
                        : 'Follow up '.$leadName,
                    'description' => (string) ($payload['recommendations']['message_draft'] ?? ''),
                    'priority' => 'medium',
                    'status' => 'pending',
                ],
                'label' => $locale === 'ar' ? '⏰ إنشاء تذكير' : '⏰ Create reminder',
            ],
            [
                'type' => 'prompt_message',
                'message' => $locale === 'ar'
                    ? 'عدّل الرسالة المقترحة لليد '.$leadId
                    : 'Help me refine the suggested message for lead '.$leadId,
                'display_text' => $locale === 'ar' ? '✏️ تعديل في المحادثة' : '✏️ Edit in chat',
                'label' => $locale === 'ar' ? 'تعديل في المحادثة' : 'Edit in chat',
            ],
        ]);

        return $actions;
    }

    protected function bestTimeWindow(array $hours): string
    {
        if ($hours === []) {
            return '09:00-12:00';
        }

        $counts = array_count_values($hours);
        arsort($counts);
        $peak = (int) array_key_first($counts);
        $start = max(0, $peak - 1);
        $end = min(23, $peak + 1);

        return sprintf('%02d:00-%02d:00', $start, $end);
    }

    protected function levelFromScore(int $score, array $thresholds): string
    {
        krsort($thresholds);
        foreach ($thresholds as $min => $level) {
            if ($score >= $min) {
                return $level;
            }
        }

        return 'low';
    }

    protected function severityFromRisk(string $risk): string
    {
        return match ($risk) {
            'high', 'critical' => 'critical',
            'medium' => 'warning',
            default => 'info',
        };
    }
}
