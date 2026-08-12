<?php

namespace App\Services\AiCopilot;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\User;
use App\Traits\UserHierarchyTrait;
use Illuminate\Support\Facades\Schema;

class CopilotLeadLostDetectiveService
{
    use UserHierarchyTrait;

    public function __construct(
        private readonly CopilotAudienceResolver $audience,
        private readonly CopilotLeadIntelligenceService $intelligence,
        private readonly CopilotLeadAssigneeResolver $assigneeResolver,
    ) {
    }

    public function isLostLead(Lead $lead): bool
    {
        $stage = strtolower(trim((string) ($lead->stage ?? '')));
        $status = strtolower(trim((string) ($lead->status ?? '')));

        foreach (['lost', 'cancel', 'canceled', 'cancelled', 'not interested', 'closed lost', 'refused'] as $needle) {
            if (str_contains($stage, $needle) || str_contains($status, $needle)) {
                return true;
            }
        }

        if (! Schema::hasTable('lead_actions')) {
            return false;
        }

        $latestType = strtolower((string) LeadAction::query()
            ->where('lead_id', $lead->id)
            ->orderByDesc('created_at')
            ->value('action_type'));

        return $latestType === 'cancel';
    }

    public function analyze(User $user, Lead $lead, string $locale = 'en', string $source = 'copilot:lost-detective'): array
    {
        if (! $this->isLostLead($lead)) {
            return ['ok' => false, 'reason' => 'not_lost_lead'];
        }

        $analysis = $this->intelligence->analyze($user, $lead, $locale, $source);
        if (! ($analysis['ok'] ?? false)) {
            return $analysis;
        }

        $facts = is_array($analysis['payload']['facts'] ?? null) ? $analysis['payload']['facts'] : [];
        $detective = $this->buildDetectiveFacts($lead, $facts, $locale);
        $cloneAdvice = $this->assigneeResolver->resolveCloneAdvice($user, $lead, $locale);
        $leadName = (string) ($analysis['lead_name'] ?? ('Lead #'.$lead->id));
        $payload = $analysis['payload'];
        $payload['facts']['detective'] = $detective;
        $payload['facts']['clone'] = [
            'can_clone' => (bool) ($cloneAdvice['can_clone'] ?? false),
            'suggested_assignee' => is_array($cloneAdvice['suggested_assignee'] ?? null)
                ? $cloneAdvice['suggested_assignee']
                : null,
            'advice' => $cloneAdvice['advice'] ?? null,
            'lesson' => $detective['lesson'] ?? null,
            'hypothesis_code' => $detective['hypothesis_code'] ?? null,
        ];
        $payload['meta']['notification_type'] = CopilotNotificationTimeBucket::TYPE_LOST_DETECTIVE;
        $payload['meta']['source'] = $source;
        $payload['recommendations']['primary_action'] = 'learn_from_loss';
        $payload['recommendations']['detective_hypothesis'] = $detective['hypothesis'] ?? null;
        $payload['recommendations']['detective_lesson'] = $detective['lesson'] ?? null;

        return [
            'ok' => true,
            'lead_id' => (int) $lead->id,
            'lead_name' => $leadName,
            'severity' => 'warning',
            'title' => $locale === 'ar'
                ? "محقق الليد الخاسر — {$leadName}"
                : "Lost Lead Detective — {$leadName}",
            'payload' => $payload,
            'ui_actions' => $this->buildUiActions($lead, $payload, $locale, $detective, $cloneAdvice),
        ];
    }

    public function buildUiActionsForLead(Lead $lead, array $payload, string $locale = 'en'): array
    {
        $detective = is_array($payload['facts']['detective'] ?? null)
            ? $payload['facts']['detective']
            : [];

        return $this->buildUiActions(
            $lead,
            $payload,
            $locale,
            $detective,
            is_array($payload['facts']['clone'] ?? null)
                ? [
                    'can_clone' => (bool) ($payload['facts']['clone']['can_clone'] ?? false),
                    'suggested_assignee' => is_array($payload['facts']['clone']['suggested_assignee'] ?? null)
                        ? $payload['facts']['clone']['suggested_assignee']
                        : null,
                ]
                : ['can_clone' => false, 'suggested_assignee' => null]
        );
    }

    /**
     * @return array<int, Lead>
     */
    public function findRecentlyLostCandidates(User $user, int $limit = 10, string $workflow = 'sales', int $lookbackDays = 14): array
    {
        if (! Schema::hasTable('leads')) {
            return [];
        }

        $limit = max(1, min($limit, 25));
        $since = now()->subDays(max(1, min($lookbackDays, 30)));

        $query = Lead::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('workflow_key', $workflow)
            ->where('updated_at', '>=', $since)
            ->where(function ($q) {
                $q->whereRaw('lower(coalesce(stage, \'\')) like ?', ['%lost%'])
                    ->orWhereRaw('lower(coalesce(stage, \'\')) like ?', ['%cancel%'])
                    ->orWhereRaw('lower(coalesce(status, \'\')) like ?', ['%lost%'])
                    ->orWhereRaw('lower(coalesce(status, \'\')) like ?', ['%cancel%'])
                    ->orWhereRaw('lower(coalesce(status, \'\')) like ?', ['%refused%']);
            });

        $viewableIds = $this->getViewableUserIds($user);
        if ($viewableIds !== null) {
            $query->where(function ($q) use ($viewableIds, $user) {
                $q->whereIn('assigned_to', $viewableIds)
                    ->orWhere('manager_id', $user->id)
                    ->orWhere('assigned_to', $user->id)
                    ->orWhereNull('assigned_to');
            });
        }

        $results = [];
        foreach ($query->with('assignedAgent:id,name')->latest('updated_at')->limit($limit * 4)->get() as $lead) {
            if (count($results) >= $limit) {
                break;
            }

            if (! $this->audience->canView($user, $lead) || ! $this->isLostLead($lead)) {
                continue;
            }

            $results[] = $lead;
        }

        return $results;
    }

    protected function buildDetectiveFacts(Lead $lead, array $facts, string $locale): array
    {
        $cancelMeta = $this->resolveCancelMeta($lead);
        $assignedName = trim((string) ($lead->assignedAgent?->name ?? ''));
        if ($assignedName === '' && (int) ($lead->assigned_to ?? 0) > 0) {
            $assignedName = 'Sales #'.(int) $lead->assigned_to;
        }

        $hypothesis = $this->buildHypothesis($lead, $facts, $cancelMeta, $locale);
        $similarWon = $this->countSimilarWonLeads($lead);

        return [
            'is_lost' => true,
            'lost_stage' => (string) ($lead->stage ?? ''),
            'lost_status' => (string) ($lead->status ?? ''),
            'cancel_reason' => $cancelMeta['reason'],
            'cancel_reason_code' => $cancelMeta['code'],
            'assigned_user_id' => (int) ($lead->assigned_to ?? 0),
            'assigned_user_name' => $assignedName !== '' ? $assignedName : null,
            'source' => trim((string) ($lead->source ?? '')),
            'project' => trim((string) ($lead->project ?? '')),
            'proposal_before_lost' => ! empty($facts['proposal_sent']),
            'followup_before_lost' => ! empty($facts['followup_done']),
            'no_answer_count' => (int) ($facts['no_answer_count'] ?? 0),
            'last_contact_hours' => (int) ($facts['last_contact_hours'] ?? 0),
            'similar_won_count' => $similarWon,
            'hypothesis_code' => $hypothesis['code'],
            'hypothesis' => $hypothesis['text'],
            'lesson' => $hypothesis['lesson'],
        ];
    }

    /**
     * @return array{reason: ?string, code: ?string}
     */
    protected function resolveCancelMeta(Lead $lead): array
    {
        if (! Schema::hasTable('lead_actions')) {
            return ['reason' => null, 'code' => null];
        }

        $cancelAction = LeadAction::query()
            ->where('lead_id', $lead->id)
            ->where(function ($q) {
                $q->where('action_type', 'cancel')
                    ->orWhere('next_action_type', 'cancel');
            })
            ->orderByDesc('created_at')
            ->first();

        if (! $cancelAction) {
            return ['reason' => null, 'code' => null];
        }

        $details = is_array($cancelAction->details) ? $cancelAction->details : [];
        $reason = trim((string) (
            $details['cancel_reason']
            ?? $details['reason']
            ?? $details['cancelReason']
            ?? $cancelAction->description
            ?? ''
        ));

        $code = null;
        $reasonLower = strtolower($reason);
        if (str_contains($reasonLower, 'price') || str_contains($reasonLower, 'سعر') || str_contains($reasonLower, 'budget')) {
            $code = 'price_objection';
        } elseif (str_contains($reasonLower, 'compet') || str_contains($reasonLower, 'منافس')) {
            $code = 'competitor';
        } elseif (str_contains($reasonLower, 'no answer') || str_contains($reasonLower, 'no_answer') || str_contains($reasonLower, 'رد')) {
            $code = 'no_response';
        }

        return [
            'reason' => $reason !== '' ? $reason : null,
            'code' => $code,
        ];
    }

    /**
     * @param  array{reason: ?string, code: ?string}  $cancelMeta
     * @return array{code: string, text: string, lesson: string}
     */
    protected function buildHypothesis(Lead $lead, array $facts, array $cancelMeta, string $locale): array
    {
        if ($cancelMeta['code'] === 'price_objection') {
            return [
                'code' => 'price_objection',
                'text' => $locale === 'ar'
                    ? 'سبب محتمل: اعتراض على السعر أو الميزانية.'
                    : 'Likely cause: price or budget objection.',
                'lesson' => $locale === 'ar'
                    ? 'راجع توقيت العرض والقيمة قبل السعر في الليدز القادمة من نفس المصدر.'
                    : 'Review value framing before price on future leads from this source.',
            ];
        }

        if ($cancelMeta['code'] === 'competitor') {
            return [
                'code' => 'competitor',
                'text' => $locale === 'ar'
                    ? 'سبب محتمل: منافس أو بديل آخر.'
                    : 'Likely cause: competitor or alternative chosen.',
                'lesson' => $locale === 'ar'
                    ? 'جهّز مقارنة واضحة ومتابعة أسرع بعد العرض.'
                    : 'Prepare a clearer comparison and follow up faster after proposals.',
            ];
        }

        if (! empty($facts['proposal_sent']) && empty($facts['followup_done'])) {
            return [
                'code' => 'proposal_no_followup',
                'text' => $locale === 'ar'
                    ? 'سبب محتمل: عرض اتبعت بدون متابعة كافية.'
                    : 'Likely cause: proposal sent without enough follow-up.',
                'lesson' => $locale === 'ar'
                    ? 'ثبّت follow-up خلال 24–48 ساعة بعد أي عرض.'
                    : 'Lock in follow-up within 24–48 hours after every proposal.',
            ];
        }

        if ((int) ($facts['no_answer_count'] ?? 0) >= 3) {
            return [
                'code' => 'no_answer_streak',
                'text' => $locale === 'ar'
                    ? 'سبب محتمل: تكرار no-answer بدون تغيير قناة.'
                    : 'Likely cause: repeated no-answer without channel change.',
                'lesson' => $locale === 'ar'
                    ? 'بدّل القناة (WhatsApp/Meeting) بعد محاولتين بدون رد.'
                    : 'Switch channel (WhatsApp/meeting) after two no-answers.',
            ];
        }

        if (! empty($facts['delayed'])) {
            return [
                'code' => 'delayed_pipeline',
                'text' => $locale === 'ar'
                    ? 'سبب محتمل: تأخير في المتابعة قبل الإغلاق.'
                    : 'Likely cause: delayed follow-up before close.',
                'lesson' => $locale === 'ar'
                    ? 'قلّل فجوات المتابعة قبل مرحلة القرار.'
                    : 'Reduce follow-up gaps before the decision stage.',
            ];
        }

        return [
            'code' => 'unknown_stall',
            'text' => $locale === 'ar'
                ? 'سبب محتمل: توقف في خط السير قبل الخسارة.'
                : 'Likely cause: pipeline stalled before the loss.',
            'lesson' => $locale === 'ar'
                ? 'راجع آخر 3 أكشنز وحدد نقطة التوقف.'
                : 'Review the last 3 actions and identify where momentum stopped.',
        ];
    }

    protected function countSimilarWonLeads(Lead $lead): int
    {
        if (! Schema::hasTable('leads')) {
            return 0;
        }

        $source = trim((string) ($lead->source ?? ''));
        if ($source === '') {
            return 0;
        }

        return (int) Lead::query()
            ->where('tenant_id', $lead->tenant_id)
            ->where('source', $source)
            ->where('id', '!=', $lead->id)
            ->where(function ($q) {
                $q->whereRaw('lower(coalesce(stage, \'\')) like ?', ['%closed%'])
                    ->orWhereRaw('lower(coalesce(status, \'\')) in (?, ?, ?)', ['converted', 'won', 'closed']);
            })
            ->count();
    }

    protected function buildUiActions(
        Lead $lead,
        array $payload,
        string $locale,
        array $detective = [],
        array $cloneAdvice = []
    ): array {
        $leadId = (int) $lead->id;
        $leadName = trim((string) ($payload['lead_name'] ?? $lead->name ?? ''));
        $hypothesis = trim((string) ($detective['hypothesis'] ?? ''));

        $actions = [
            [
                'type' => 'navigate',
                'path' => '/leads?lead_id='.$leadId.'&tab=all-actions',
                'pathname' => '/leads',
                'search' => '?lead_id='.$leadId.'&tab=all-actions',
                'label' => $locale === 'ar' ? '📋 مراجعة الأكشنز' : '📋 Review actions',
            ],
            [
                'type' => 'prompt_message',
                'message' => $locale === 'ar'
                    ? "حلل سبب خسارة الليد {$leadId} واقترح كيف أتجنبها في ليدز مشابهة"
                    : "Analyze why lead {$leadId} was lost and how to avoid it on similar leads",
                'display_text' => $locale === 'ar' ? '🕵️ تحليل أعمق' : '🕵️ Deep analysis',
                'label' => $locale === 'ar' ? '🕵️ تحليل أعمق' : '🕵️ Deep analysis',
            ],
        ];

        $suggested = is_array($cloneAdvice['suggested_assignee'] ?? null)
            ? $cloneAdvice['suggested_assignee']
            : null;

        if (! empty($cloneAdvice['can_clone']) && $suggested) {
            $assigneeId = (int) ($suggested['user_id'] ?? 0);
            $assigneeName = trim((string) ($suggested['name'] ?? ''));

            if ($assigneeId > 0) {
                $actions[] = [
                    'type' => 'open_assign_modal',
                    'action' => 'clone_lead',
                    'payload' => [
                        'lead_id' => $leadId,
                        'lead_name' => $leadName,
                        'duplicate' => true,
                        'suggested_user_id' => $assigneeId,
                        'suggested_user_name' => $assigneeName,
                        'clone_lesson' => trim((string) ($detective['lesson'] ?? '')),
                        'clone_hypothesis' => $hypothesis,
                    ],
                    'label' => $locale === 'ar'
                        ? '🧬 نسخ وإسناد كجديد'
                        : '🧬 Clone & assign as fresh',
                ];
            }
        }

        return $actions;
    }
}
