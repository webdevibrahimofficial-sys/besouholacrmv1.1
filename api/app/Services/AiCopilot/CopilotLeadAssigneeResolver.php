<?php

namespace App\Services\AiCopilot;

use App\Models\Lead;
use App\Models\User;
use App\Traits\UserHierarchyTrait;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class CopilotLeadAssigneeResolver
{
    use UserHierarchyTrait;

    public function resolveAssignmentAdvice(User $viewer, Lead $lead, string $locale = 'en'): array
    {
        $assignedTo = (int) ($lead->assigned_to ?? 0);
        if ($assignedTo > 0) {
            return [
                'is_unassigned' => false,
                'can_assign' => false,
                'suggested_assignee' => null,
                'advice' => null,
            ];
        }

        if (! $this->viewerCanAssignLeads($viewer)) {
            return [
                'is_unassigned' => true,
                'can_assign' => false,
                'suggested_assignee' => null,
                'advice' => $locale === 'ar'
                    ? 'الليد غير مسند لأي سيلز. اطلب من المدير أو التيم ليدر تعيينه.'
                    : 'This lead is not assigned to sales. Ask a manager or team leader to assign it.',
            ];
        }

        $suggested = $this->suggestAssignee($viewer, $lead, $locale);
        if (! $suggested) {
            return [
                'is_unassigned' => true,
                'can_assign' => true,
                'suggested_assignee' => null,
                'advice' => $locale === 'ar'
                    ? 'الليد غير مسند. لا يوجد سيلز متاح في نطاق صلاحياتك حالياً.'
                    : 'This lead is unassigned. No eligible sales user was found in your scope.',
            ];
        }

        return [
            'is_unassigned' => true,
            'can_assign' => true,
            'suggested_assignee' => $suggested,
            'advice' => $locale === 'ar'
                ? "الليد غير مسند. يُفضّل إسناده إلى {$suggested['name']} — {$suggested['reason']}."
                : "Lead is unassigned. Best match: {$suggested['name']} — {$suggested['reason']}.",
        ];
    }

    public function canAssignLeads(User $viewer): bool
    {
        return $this->viewerCanAssignLeads($viewer);
    }

    public function resolveCloneAdvice(User $viewer, Lead $lead, string $locale = 'en'): array
    {
        if (! $this->viewerCanAssignLeads($viewer)) {
            return [
                'can_clone' => false,
                'suggested_assignee' => null,
                'advice' => $locale === 'ar'
                    ? 'اطلب من المدير نسخ الليد وإسناده كفرصة جديدة.'
                    : 'Ask a manager to clone this lead and assign it as a fresh opportunity.',
            ];
        }

        $suggested = $this->suggestCloneAssignee($viewer, $lead, $locale);
        if (! $suggested) {
            return [
                'can_clone' => false,
                'suggested_assignee' => null,
                'advice' => $locale === 'ar'
                    ? 'لا يوجد سيلز متاح لنسخ الليد وإسناده حالياً.'
                    : 'No eligible sales user is available to receive a cloned lead right now.',
            ];
        }

        return [
            'can_clone' => true,
            'suggested_assignee' => $suggested,
            'advice' => $locale === 'ar'
                ? "جرّب إعادة المحاولة عبر نسخ الليد وإسناده إلى {$suggested['name']} — {$suggested['reason']}."
                : "Retry by cloning the lead and assigning it to {$suggested['name']} — {$suggested['reason']}.",
        ];
    }

    protected function viewerCanAssignLeads(User $viewer): bool
    {
        if ($viewer->is_super_admin) {
            return true;
        }

        $roles = $viewer->getRoleNames()->map(fn ($role) => strtolower((string) $role))->toArray();
        $roleLower = strtolower(trim((string) ($viewer->job_title ?? $viewer->role ?? '')));

        $isSalesPerson = str_contains($roleLower, 'sales person')
            || str_contains($roleLower, 'salesperson')
            || in_array('sales person', $roles, true)
            || in_array('salesperson', $roles, true);

        if (
            $isSalesPerson
            && ! str_contains($roleLower, 'manager')
            && ! str_contains($roleLower, 'admin')
            && ! str_contains($roleLower, 'leader')
            && ! str_contains($roleLower, 'director')
        ) {
            return false;
        }

        return true;
    }

    protected function suggestAssignee(User $viewer, Lead $lead, string $locale): ?array
    {
        return $this->pickLowestLoadAssignee(
            $viewer,
            $lead,
            $locale,
            $this->eligibleSalesUsers($viewer)
        );
    }

    protected function suggestCloneAssignee(User $viewer, Lead $lead, string $locale): ?array
    {
        $candidates = $this->eligibleSalesUsers($viewer);
        if ($candidates->isEmpty()) {
            return null;
        }

        $currentAssigneeId = (int) ($lead->assigned_to ?? 0);
        if ($currentAssigneeId > 0) {
            $alternatives = $candidates->filter(
                fn (User $user) => (int) $user->id !== $currentAssigneeId
            );
            if ($alternatives->isNotEmpty()) {
                $candidates = $alternatives->values();
            }
        }

        return $this->pickLowestLoadAssignee($viewer, $lead, $locale, $candidates);
    }

    /**
     * @param  Collection<int, User>  $candidates
     */
    protected function pickLowestLoadAssignee(User $viewer, Lead $lead, string $locale, Collection $candidates): ?array
    {
        if ($candidates->isEmpty()) {
            return null;
        }

        $leadManagerId = (int) ($lead->manager_id ?? 0);
        if ($leadManagerId > 0) {
            $teamCandidates = $candidates->filter(
                fn (User $user) => (int) ($user->manager_id ?? 0) === $leadManagerId
                    || (int) $user->id === $leadManagerId
            );
            if ($teamCandidates->isNotEmpty()) {
                $candidates = $teamCandidates->values();
            }
        }

        $counts = $this->openLeadCountsByUser($viewer, $candidates->pluck('id')->all());

        /** @var User|null $best */
        $best = null;
        $bestCount = PHP_INT_MAX;
        foreach ($candidates as $candidate) {
            $count = (int) ($counts[(int) $candidate->id] ?? 0);
            if ($count < $bestCount) {
                $bestCount = $count;
                $best = $candidate;
            }
        }

        if (! $best) {
            return null;
        }

        $reason = $locale === 'ar'
            ? 'أقل عدد ليدز نشطة ('.$bestCount.')'
            : 'lowest active lead load ('.$bestCount.')';

        return [
            'user_id' => (int) $best->id,
            'name' => trim((string) $best->name),
            'open_leads' => $bestCount,
            'reason' => $reason,
        ];
    }

    /**
     * @return Collection<int, User>
     */
    protected function eligibleSalesUsers(User $viewer): Collection
    {
        if (! Schema::hasTable('users')) {
            return collect();
        }

        $query = User::query()
            ->where('tenant_id', $viewer->tenant_id)
            ->where(function ($q) {
                $q->whereNull('status')
                    ->orWhere('status', 'active')
                    ->orWhere('status', 'Active')
                    ->orWhere('status', 1)
                    ->orWhere('status', '1');
            });

        $viewableIds = $this->getViewableUserIds($viewer);
        if ($viewableIds !== null) {
            $query->whereIn('id', $viewableIds);
        }

        return $query
            ->orderBy('name')
            ->get(['id', 'name', 'job_title', 'manager_id'])
            ->filter(fn (User $user) => $this->isSalesAssignableUser($user))
            ->values();
    }

    protected function isSalesAssignableUser(User $user): bool
    {
        $roleValues = collect([
            $user->job_title,
            $user->role,
        ])
            ->merge($user->getRoleNames())
            ->filter()
            ->map(fn ($value) => strtolower(trim((string) $value)))
            ->unique()
            ->values();

        foreach (['sales person', 'salesperson', 'telesales', 'sales executive', 'sales rep'] as $needle) {
            if ($roleValues->contains(fn ($role) => str_contains($role, $needle))) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, int>  $userIds
     * @return array<int, int>
     */
    protected function openLeadCountsByUser(User $viewer, array $userIds): array
    {
        if ($userIds === [] || ! Schema::hasTable('leads')) {
            return [];
        }

        return Lead::query()
            ->where('tenant_id', $viewer->tenant_id)
            ->whereIn('assigned_to', $userIds)
            ->where(function ($q) {
                $q->whereNull('stage')
                    ->orWhereNotIn('stage', ['Closed', 'Canceled', 'closed', 'canceled', 'Duplicate', 'duplicate']);
            })
            ->selectRaw('assigned_to, COUNT(*) as aggregate')
            ->groupBy('assigned_to')
            ->pluck('aggregate', 'assigned_to')
            ->map(fn ($count) => (int) $count)
            ->all();
    }
}
