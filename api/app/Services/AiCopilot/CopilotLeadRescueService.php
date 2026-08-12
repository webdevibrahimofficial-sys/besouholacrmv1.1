<?php

namespace App\Services\AiCopilot;

use App\Models\Lead;
use App\Models\User;
use App\Traits\UserHierarchyTrait;
use Illuminate\Support\Facades\Schema;

class CopilotLeadRescueService
{
    use UserHierarchyTrait;

    public function __construct(
        private readonly CopilotAudienceResolver $audience,
        private readonly CopilotLeadIntelligenceService $intelligence,
    ) {
    }

    public function qualifiesForRescue(array $facts): bool
    {
        if (! empty($facts['delayed'])) {
            return true;
        }

        $risk = strtolower((string) ($facts['risk_level'] ?? ''));
        if (in_array($risk, ['high', 'critical'], true)) {
            return true;
        }

        if (
            ! empty($facts['proposal_sent'])
            && empty($facts['followup_done'])
            && (int) ($facts['last_contact_hours'] ?? 0) >= 24
        ) {
            return true;
        }

        if ((int) ($facts['no_answer_count'] ?? 0) >= 3) {
            return true;
        }

        return false;
    }

    public function analyze(User $user, Lead $lead, string $locale = 'en', string $source = 'copilot:rescue'): array
    {
        $analysis = $this->intelligence->analyze($user, $lead, $locale, $source);
        if (! ($analysis['ok'] ?? false)) {
            return $analysis;
        }

        $facts = is_array($analysis['payload']['facts'] ?? null) ? $analysis['payload']['facts'] : [];
        if (! $this->qualifiesForRescue($facts)) {
            return ['ok' => false, 'reason' => 'not_rescue_worthy'];
        }

        $leadName = (string) ($analysis['lead_name'] ?? ('Lead #'.$lead->id));
        $payload = $analysis['payload'];
        $payload['meta']['notification_type'] = CopilotNotificationTimeBucket::TYPE_LEAD_RESCUE;
        $payload['meta']['source'] = $source;

        return [
            'ok' => true,
            'lead_id' => (int) $lead->id,
            'lead_name' => $leadName,
            'severity' => 'critical',
            'title' => $locale === 'ar'
                ? "إنقاذ الليد — {$leadName}"
                : "Lead Rescue — {$leadName}",
            'payload' => $payload,
            'ui_actions' => $analysis['ui_actions'] ?? [],
        ];
    }

    /**
     * @return array<int, Lead>
     */
    public function findRescueCandidates(User $user, int $limit = 10, string $workflow = 'sales'): array
    {
        if (! Schema::hasTable('leads') || ! Schema::hasTable('lead_actions')) {
            return [];
        }

        $limit = max(1, min($limit, 25));
        $eligibleStatuses = ['scheduled', 'Scheduled', 'pending', 'in_progress', 'in-progress', 'in progress'];

        $query = Lead::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('workflow_key', $workflow);

        $viewableIds = $this->getViewableUserIds($user);
        if ($viewableIds !== null) {
            $query->where(function ($q) use ($viewableIds, $user) {
                $q->whereIn('assigned_to', $viewableIds)
                    ->orWhere('manager_id', $user->id)
                    ->orWhere('assigned_to', $user->id);
            });
        }

        $query->whereHas('actions', function ($q) use ($eligibleStatuses) {
            $q->whereIn('details->status', $eligibleStatuses)
                ->whereNotIn('action_type', ['closing_deals', 'cancel'])
                ->whereNotNull('details->date')
                ->where('details->date', '!=', '');
        });

        return $query->with('assignedAgent:id,name')
            ->latest('updated_at')
            ->limit($limit)
            ->get()
            ->filter(fn (Lead $lead) => $this->audience->canView($user, $lead))
            ->values()
            ->all();
    }
}
