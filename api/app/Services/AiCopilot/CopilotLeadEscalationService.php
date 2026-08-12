<?php

namespace App\Services\AiCopilot;

use App\Models\Lead;
use App\Models\User;
use App\Traits\UserHierarchyTrait;
use Illuminate\Support\Facades\Schema;

class CopilotLeadEscalationService
{
    use UserHierarchyTrait;

    public function __construct(
        private readonly CopilotAudienceResolver $audience,
        private readonly CopilotLeadIntelligenceService $intelligence,
        private readonly CopilotLeadRescueService $rescue,
    ) {
    }

    public function canReceiveEscalations(User $user): bool
    {
        if ($user->is_super_admin) {
            return true;
        }

        $roles = $user->getRoleNames()->map(fn ($role) => strtolower((string) $role))->toArray();
        $roleLower = strtolower(trim((string) ($user->job_title ?? $user->role ?? '')));

        foreach ([
            'sales manager',
            'telesales manager',
            'team leader',
            'branch manager',
            'director',
            'operation manager',
            'operations manager',
            'admin',
            'tenant admin',
            'tenant-admin',
        ] as $needle) {
            if (str_contains($roleLower, $needle) || in_array($needle, $roles, true)) {
                return true;
            }
        }

        $viewableIds = $this->getViewableUserIds($user);

        return is_array($viewableIds) && count($viewableIds) > 1;
    }

    public function qualifiesForEscalation(array $facts, Lead $lead): bool
    {
        if ((int) ($lead->assigned_to ?? 0) <= 0) {
            return false;
        }

        if (! $this->rescue->qualifiesForRescue($facts)) {
            return false;
        }

        $hours = (int) ($facts['last_contact_hours'] ?? 0);
        $risk = strtolower((string) ($facts['risk_level'] ?? ''));

        if (! empty($facts['delayed']) && $hours >= 24) {
            return true;
        }

        if (
            ! empty($facts['proposal_sent'])
            && empty($facts['followup_done'])
            && $hours >= 48
        ) {
            return true;
        }

        if ((int) ($facts['no_answer_count'] ?? 0) >= 3 && $hours >= 24) {
            return true;
        }

        if (in_array($risk, ['high', 'critical'], true) && $hours >= 48) {
            return true;
        }

        return false;
    }

    public function analyze(User $manager, Lead $lead, string $locale = 'en', string $source = 'copilot:escalation'): array
    {
        if (! $this->canReceiveEscalations($manager)) {
            return ['ok' => false, 'reason' => 'not_escalation_audience'];
        }

        $analysis = $this->intelligence->analyze($manager, $lead, $locale, $source);
        if (! ($analysis['ok'] ?? false)) {
            return $analysis;
        }

        $facts = is_array($analysis['payload']['facts'] ?? null) ? $analysis['payload']['facts'] : [];
        if (! $this->qualifiesForEscalation($facts, $lead)) {
            return ['ok' => false, 'reason' => 'not_escalation_worthy'];
        }

        $escalation = $this->buildEscalationFacts($lead, $facts, $locale);
        $leadName = (string) ($analysis['lead_name'] ?? ('Lead #'.$lead->id));
        $payload = $analysis['payload'];
        $payload['facts']['escalation'] = $escalation;
        $payload['meta']['notification_type'] = CopilotNotificationTimeBucket::TYPE_ESCALATION;
        $payload['meta']['source'] = $source;
        $payload['recommendations']['primary_action'] = 'manager_intervention';
        $payload['recommendations']['manager_note'] = $escalation['advice'] ?? null;

        return [
            'ok' => true,
            'lead_id' => (int) $lead->id,
            'lead_name' => $leadName,
            'severity' => 'critical',
            'title' => $locale === 'ar'
                ? "تصعيد للمدير — {$leadName}"
                : "Manager Escalation — {$leadName}",
            'payload' => $payload,
            'ui_actions' => $this->buildUiActions($lead, $payload, $locale, $escalation),
        ];
    }

    public function buildUiActionsForLead(Lead $lead, array $payload, string $locale = 'en'): array
    {
        $escalation = is_array($payload['facts']['escalation'] ?? null)
            ? $payload['facts']['escalation']
            : [];

        return $this->buildUiActions($lead, $payload, $locale, $escalation);
    }

    /**
     * @return array<int, Lead>
     */
    public function findEscalationCandidates(User $manager, int $limit = 10, string $workflow = 'sales'): array
    {
        if (! $this->canReceiveEscalations($manager) || ! Schema::hasTable('leads')) {
            return [];
        }

        $limit = max(1, min($limit, 25));

        $query = Lead::query()
            ->where('tenant_id', $manager->tenant_id)
            ->where('workflow_key', $workflow)
            ->whereNotNull('assigned_to')
            ->where('assigned_to', '>', 0);

        $viewableIds = $this->getViewableUserIds($manager);
        if ($viewableIds !== null) {
            $teamIds = array_values(array_filter(
                array_map('intval', $viewableIds),
                fn (int $id) => $id > 0 && $id !== (int) $manager->id
            ));

            if ($teamIds === []) {
                return [];
            }

            $query->whereIn('assigned_to', $teamIds);
        }

        $candidates = $query->with(['assignedAgent:id,name'])
            ->latest('updated_at')
            ->limit($limit * 4)
            ->get();

        $results = [];
        foreach ($candidates as $lead) {
            if (count($results) >= $limit) {
                break;
            }

            if (! $this->audience->canView($manager, $lead)) {
                continue;
            }

            $analysis = $this->intelligence->analyze($manager, $lead, 'en', 'copilot:escalation-scan');
            if (! ($analysis['ok'] ?? false)) {
                continue;
            }

            $facts = is_array($analysis['payload']['facts'] ?? null) ? $analysis['payload']['facts'] : [];
            if (! $this->qualifiesForEscalation($facts, $lead)) {
                continue;
            }

            $results[] = $lead;
        }

        return $results;
    }

    protected function buildEscalationFacts(Lead $lead, array $facts, string $locale): array
    {
        $assigneeId = (int) ($lead->assigned_to ?? 0);
        $assigneeName = trim((string) ($lead->assignedAgent?->name ?? ''));
        if ($assigneeName === '') {
            $assigneeName = 'Sales #'.$assigneeId;
        }

        $reasonCode = 'team_followup_stalled';
        $reason = $locale === 'ar'
            ? 'الليد في حالة خطرة والمتابعة متوقفة.'
            : 'Lead is at risk and follow-up has stalled.';

        if (! empty($facts['delayed'])) {
            $reasonCode = 'delayed_followup_ignored';
            $reason = $locale === 'ar'
                ? 'متابعة متأخرة ولم يتم التحرك عليها.'
                : 'Follow-up is overdue and still not handled.';
        } elseif (! empty($facts['proposal_sent']) && empty($facts['followup_done'])) {
            $reasonCode = 'proposal_followup_ignored';
            $hours = (int) ($facts['last_contact_hours'] ?? 0);
            $reason = $locale === 'ar'
                ? 'عرض اتبعت من '.($hours > 0 ? "{$hours} ساعة" : 'فترة').' بدون متابعة.'
                : 'Proposal sent '.($hours > 0 ? "{$hours}h" : 'ago').' with no follow-up.';
        } elseif ((int) ($facts['no_answer_count'] ?? 0) >= 3) {
            $reasonCode = 'no_answer_streak';
            $reason = $locale === 'ar'
                ? (int) $facts['no_answer_count'].' محاولات بدون رد بدون خطة بديلة.'
                : (int) $facts['no_answer_count'].' no-answer attempts without a recovery plan.';
        }

        $advice = $locale === 'ar'
            ? "تابع مع {$assigneeName} — {$reason}"
            : "Follow up with {$assigneeName} — {$reason}";

        return [
            'assigned_user_id' => $assigneeId,
            'assigned_user_name' => $assigneeName,
            'reason_code' => $reasonCode,
            'reason' => $reason,
            'advice' => $advice,
            'last_contact_hours' => (int) ($facts['last_contact_hours'] ?? 0),
            'risk_level' => (string) ($facts['risk_level'] ?? 'medium'),
        ];
    }

    protected function buildUiActions(Lead $lead, array $payload, string $locale, array $escalation = []): array
    {
        $leadId = (int) $lead->id;
        $leadName = trim((string) ($payload['lead_name'] ?? $lead->name ?? ''));
        $assigneeName = trim((string) ($escalation['assigned_user_name'] ?? ''));

        return [
            [
                'type' => 'navigate',
                'path' => '/leads?lead_id='.$leadId.'&tab=all-actions',
                'pathname' => '/leads',
                'search' => '?lead_id='.$leadId.'&tab=all-actions',
                'label' => $locale === 'ar' ? '📋 فتح الليد' : '📋 Open lead',
            ],
            [
                'type' => 'prompt_message',
                'message' => $locale === 'ar'
                    ? "ساعدني أعمل خطة تصعيد مع {$assigneeName} لليد {$leadId}"
                    : "Help me plan a manager escalation with {$assigneeName} for lead {$leadId}",
                'display_text' => $locale === 'ar' ? '💬 خطة تصعيد' : '💬 Escalation plan',
                'label' => $locale === 'ar' ? '💬 خطة تصعيد' : '💬 Escalation plan',
            ],
            [
                'type' => 'confirm_action',
                'action' => 'create_task_for_lead',
                'payload' => [
                    'lead_id' => $leadId,
                    'title' => $locale === 'ar'
                        ? 'متابعة مع '.$assigneeName.' — '.$leadName
                        : 'Check in with '.$assigneeName.' — '.$leadName,
                    'description' => (string) ($escalation['advice'] ?? ''),
                    'priority' => 'high',
                    'status' => 'pending',
                ],
                'label' => $locale === 'ar' ? '⏰ تذكير للمدير' : '⏰ Manager reminder',
            ],
        ];
    }
}
