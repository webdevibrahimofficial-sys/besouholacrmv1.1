<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\RotationRule;
use App\Models\RotationSetting;
use App\Models\RotationState;
use App\Models\Stage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

class LeadRotationEngine
{
    public function getSettings(int $tenantId): RotationSetting
    {
        return RotationSetting::firstOrCreate(
            ['tenant_id' => $tenantId],
            [
                'allow_assign_rotation' => false,
                'delay_assign_rotation' => false,
                'work_from' => '00:00',
                'work_to' => '23:59',
                'delay_work_from' => '00:00',
                'delay_work_to' => '23:59',
                'reshuffle_cold_leads' => false,
                'reshuffle_cold_leads_number' => 0,
            ]
        );
    }

    public function isWithinWindow(string $from, string $to, \DateTimeInterface $now): bool
    {
        $nowTime = $now->format('H:i');
        $from = substr((string) $from, 0, 5);
        $to = substr((string) $to, 0, 5);

        if ($from === $to) {
            return true;
        }

        if ($from < $to) {
            return $nowTime >= $from && $nowTime <= $to;
        }

        return $nowTime >= $from || $nowTime <= $to;
    }

    public function isNewLeadStage(Lead $lead): bool
    {
        $stage = strtolower(trim((string) ($lead->stage ?? '')));
        $status = strtolower(trim((string) ($lead->status ?? '')));

        if ($stage === 'new' || $stage === 'new lead' || str_contains($stage, 'new')) {
            return true;
        }

        return $stage === '' && $status === 'new';
    }

    public function buildQueueKey(Lead $lead, array $filters, ?int $scopeManagerId = null): string
    {
        $tenantId = (int) ($lead->tenant_id ?? 0);
        $isGeneral = $tenantId ? $this->isGeneralTenant($tenantId) : false;
        $payload = [
            'company_type' => $isGeneral ? 'general' : 'real_estate',
            'project_id' => $filters['project_id'] ?? null,
            'item_id' => $filters['item_id'] ?? null,
            'source' => $this->normalizeSource($filters['source'] ?? null),
            'region' => $this->normalizeRegion($filters['region'] ?? null),
            'scope_manager_id' => $scopeManagerId ? (int) $scopeManagerId : null,
        ];

        return sha1(json_encode($payload));
    }

    public function resolveLeadFilters(Lead $lead, ?int $tenantId = null): array
    {
        $tenantId = $tenantId ?? (int) ($lead->tenant_id ?? 0);
        $isGeneral = $tenantId ? $this->isGeneralTenant($tenantId) : false;

        $projectId = null;
        $itemId = null;
        if ($isGeneral) {
            if (!empty($lead->item_id)) {
                $itemId = (int) $lead->item_id;
            }
        } else {
            if (!empty($lead->project_id)) {
                $projectId = (int) $lead->project_id;
            }
        }

        return [
            'project_id' => $projectId,
            'item_id' => $itemId,
            'source' => $lead->source ?? null,
            'region' => $lead->location ?? null,
        ];
    }

    /**
     * Full subtree under a manager (does not include the manager by default).
     *
     * @return array<int, int>
     */
    public function collectTeamMemberIds(User $root, bool $includeSelf = false): array
    {
        $ids = [];
        $all = User::where('tenant_id', $root->tenant_id)->get(['id', 'manager_id', 'tenant_id']);
        $byManager = [];
        foreach ($all as $u) {
            $byManager[$u->manager_id ?? 0][] = $u;
        }

        $queue = [(int) $root->id];
        $visited = [];
        while (!empty($queue)) {
            $current = array_shift($queue);
            if (isset($visited[$current])) {
                continue;
            }
            $visited[$current] = true;
            $children = $byManager[$current] ?? [];
            foreach ($children as $child) {
                $ids[] = (int) $child->id;
                $queue[] = (int) $child->id;
            }
        }

        if ($includeSelf) {
            $ids[] = (int) $root->id;
        }

        return array_values(array_unique($ids));
    }

    public function isTeamScopedImporter(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        $roles = method_exists($user, 'getRoleNames')
            ? $user->getRoleNames()->map(fn ($r) => strtolower((string) $r))->toArray()
            : [];
        $roleLower = strtolower(trim((string) ($user->role ?? $user->job_title ?? '')));

        $isTeamLeader = str_contains($roleLower, 'team leader')
            || str_contains($roleLower, 'teamleader')
            || in_array('team leader', $roles, true);

        $isSalesManager = str_contains($roleLower, 'sales manager')
            || in_array('sales manager', $roles, true)
            || str_contains($roleLower, 'telesales manager')
            || in_array('telesales manager', $roles, true);

        return $isTeamLeader || $isSalesManager;
    }

    public function getEligibleAssignUserIds(int $tenantId, array $filters, ?array $scopeUserIds = null): array
    {
        $q = RotationRule::query()
            ->where('tenant_id', $tenantId)
            ->where('type', 'assign')
            ->where('is_active', true);

        $isGeneral = $this->isGeneralTenant($tenantId);
        if ($isGeneral) {
            $q->whereNull('project_id');
            if (!empty($filters['item_id'])) {
                $q->where(function ($sub) use ($filters) {
                    $sub->whereNull('item_id')->orWhere('item_id', (int) $filters['item_id']);
                });
            } else {
                $q->whereNull('item_id');
            }
        } else {
            $q->whereNull('item_id');
            if (!empty($filters['project_id'])) {
                $q->where(function ($sub) use ($filters) {
                    $sub->whereNull('project_id')->orWhere('project_id', (int) $filters['project_id']);
                });
            } else {
                $q->whereNull('project_id');
            }
        }

        $source = $this->normalizeSource($filters['source'] ?? null);
        if ($source !== null && $source !== '') {
            $q->where(function ($sub) use ($source) {
                $sub->whereNull('source')->orWhere('source', $source);
            });
        } else {
            $q->whereNull('source');
        }

        $region = $this->normalizeRegion($filters['region'] ?? null);
        if ($region !== null && $region !== '') {
            $q->where(function ($sub) use ($region) {
                $sub->whereNull('regions')->orWhereJsonContains('regions', $region);
            });
        } else {
            $q->whereNull('regions');
        }

        $rules = $q
            ->orderBy('position')
            ->orderBy('id')
            ->get(['user_id']);

        $userIds = $rules->pluck('user_id')->map(fn ($v) => (int) $v)->values()->all();
        if (!$userIds) {
            return [];
        }

        $activeUserIds = User::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('id', $userIds)
            ->where(function ($sub) {
                $sub->whereNull('status')->orWhereIn('status', ['Active', 'active']);
            })
            ->pluck('id')
            ->map(fn ($v) => (int) $v)
            ->all();

        $activeSet = array_flip($activeUserIds);
        $eligible = array_values(array_filter($userIds, fn ($id) => isset($activeSet[(int) $id])));

        if ($scopeUserIds !== null) {
            $scopeSet = array_flip(array_map('intval', $scopeUserIds));
            $eligible = array_values(array_filter($eligible, fn ($id) => isset($scopeSet[(int) $id])));
        }

        return $eligible;
    }

    public function isUserInDelayRotation(int $tenantId, int $userId, array $filters): bool
    {
        $q = RotationRule::query()
            ->where('tenant_id', $tenantId)
            ->where('type', 'delay')
            ->where('is_active', true)
            ->where('user_id', $userId);

        $isGeneral = $this->isGeneralTenant($tenantId);
        if ($isGeneral) {
            $q->whereNull('project_id');
            if (!empty($filters['item_id'])) {
                $q->where(function ($sub) use ($filters) {
                    $sub->whereNull('item_id')->orWhere('item_id', (int) $filters['item_id']);
                });
            } else {
                $q->whereNull('item_id');
            }
        } else {
            $q->whereNull('item_id');
            if (!empty($filters['project_id'])) {
                $q->where(function ($sub) use ($filters) {
                    $sub->whereNull('project_id')->orWhere('project_id', (int) $filters['project_id']);
                });
            } else {
                $q->whereNull('project_id');
            }
        }

        $source = $this->normalizeSource($filters['source'] ?? null);
        if ($source !== null && $source !== '') {
            $q->where(function ($sub) use ($source) {
                $sub->whereNull('source')->orWhere('source', $source);
            });
        } else {
            $q->whereNull('source');
        }

        $region = $this->normalizeRegion($filters['region'] ?? null);
        if ($region !== null && $region !== '') {
            $q->where(function ($sub) use ($region) {
                $sub->whereNull('regions')->orWhereJsonContains('regions', $region);
            });
        } else {
            $q->whereNull('regions');
        }

        return $q->exists();
    }

    public function pickNextUserId(int $tenantId, string $queueKey, array $userIds): ?int
    {
        if (!$userIds) {
            return null;
        }

        $state = RotationState::firstOrCreate(
            ['tenant_id' => $tenantId, 'queue_key' => $queueKey],
            ['last_user_id' => null]
        );

        $last = $state->last_user_id ? (int) $state->last_user_id : null;
        if (!$last) {
            $next = (int) $userIds[0];
            $state->last_user_id = $next;
            $state->save();
            return $next;
        }

        $idx = array_search($last, $userIds, true);
        if ($idx === false) {
            $next = (int) $userIds[0];
            $state->last_user_id = $next;
            $state->save();
            return $next;
        }

        $nextIdx = $idx + 1;
        if ($nextIdx >= count($userIds)) {
            $nextIdx = 0;
        }

        $next = (int) $userIds[$nextIdx];
        $state->last_user_id = $next;
        $state->save();

        return $next;
    }

    public function pickNextAfterUserId(int $tenantId, string $queueKey, array $userIds, int $currentUserId): ?int
    {
        if (!$userIds) {
            return null;
        }

        $idx = array_search($currentUserId, $userIds, true);
        if ($idx === false) {
            return null;
        }

        $nextIdx = $idx + 1;
        if ($nextIdx >= count($userIds)) {
            $nextIdx = 0;
        }

        $next = (int) $userIds[$nextIdx];

        $state = RotationState::firstOrCreate(
            ['tenant_id' => $tenantId, 'queue_key' => $queueKey],
            ['last_user_id' => null]
        );
        $state->last_user_id = $next;
        $state->save();

        return $next;
    }

    public function assignLeadToUser(Lead $lead, int $userId): void
    {
        $assignee = User::find($userId);
        if (!$assignee) {
            return;
        }

        $allowedSources = collect($assignee->allowed_sources ?? [])
            ->map(function ($value) {
                return strtolower(trim(preg_replace('/\s+/', ' ', str_replace(['_', '-'], ' ', (string) $value))));
            })
            ->filter()
            ->unique()
            ->values();

        $leadSource = strtolower(trim(preg_replace('/\s+/', ' ', str_replace(['_', '-'], ' ', (string) ($lead->source ?? '')))));
        if ($allowedSources->isNotEmpty() && ($leadSource === '' || !$allowedSources->contains($leadSource))) {
            return;
        }

        $allowedProjects = collect($assignee->allowed_projects ?? [])
            ->map(function ($value) {
                return strtolower(trim(preg_replace('/\s+/', ' ', str_replace(['_', '-'], ' ', (string) $value))));
            })
            ->filter()
            ->unique()
            ->values();

        $leadProject = '';
        if (!empty($lead->project_id)) {
            $project = \App\Models\Project::find($lead->project_id);
            $leadProject = strtolower(trim(preg_replace('/\s+/', ' ', str_replace(['_', '-'], ' ', (string) ($project?->name ?? $project?->name_ar ?? '')))));
        }
        if ($leadProject === '') {
            $leadProject = strtolower(trim(preg_replace('/\s+/', ' ', str_replace(['_', '-'], ' ', (string) ($lead->project ?? '')))));
        }
        if ($allowedProjects->isNotEmpty() && ($leadProject === '' || !$allowedProjects->contains($leadProject))) {
            return;
        }

        $lead->assigned_to = $assignee->id;
        $lead->sales_person = $assignee->name;
        if (Schema::hasColumn('leads', 'assigned_at') && empty($lead->assigned_at)) {
            $lead->assigned_at = now();
        }
        $lead->save();
    }

    public function unassignToAdminFallback(Lead $lead): void
    {
        $lead->assigned_to = null;
        if (Schema::hasColumn('leads', 'sales_person')) {
            $lead->sales_person = null;
        }
        $lead->save();
    }

    /**
     * Delay rotation threshold in hours for the lead's current stage.
     * Prefer stage_id, then name/name_ar, then stage type.
     * Tenant-specific stages win over shared/global ones.
     */
    public function resolveStageDelayHours(Lead $lead, int $tenantId, $stages = null): int
    {
        if (!Schema::hasColumn('stages', 'delay_time')) {
            return 0;
        }

        if ($stages === null) {
            $stages = Stage::query()
                ->withoutGlobalScope('tenant')
                ->where(function ($q) use ($tenantId) {
                    $q->whereNull('tenant_id')->orWhere('tenant_id', $tenantId);
                })
                ->orderByRaw('case when tenant_id is null then 1 else 0 end')
                ->orderByDesc('id')
                ->get(['id', 'tenant_id', 'name', 'name_ar', 'type', 'delay_time']);
        }

        $list = collect($stages)->values();
        if ($list->isEmpty()) {
            return 0;
        }

        // Prefer tenant rows over shared/global rows when both match.
        $list = $list->sortBy(function ($stage) use ($tenantId) {
            $rowTenant = $stage->tenant_id ?? null;
            if ((int) $rowTenant === (int) $tenantId) {
                return 0;
            }
            if ($rowTenant === null || $rowTenant === '') {
                return 1;
            }
            return 2;
        })->values();

        $stageId = !empty($lead->stage_id) ? (int) $lead->stage_id : null;
        if ($stageId) {
            $byId = $list->first(fn ($stage) => (int) ($stage->id ?? 0) === $stageId);
            if ($byId) {
                return max(0, (int) ($byId->delay_time ?? 0));
            }
        }

        $leadStageKey = $this->normalizeStageKey($lead->stage ?? '');
        if ($leadStageKey !== '') {
            foreach ($list as $stage) {
                $nameKey = $this->normalizeStageKey($stage->name ?? '');
                $nameArKey = $this->normalizeStageKey($stage->name_ar ?? '');
                $typeKey = $this->normalizeStageKey($stage->type ?? '');
                if (
                    ($nameKey !== '' && $nameKey === $leadStageKey)
                    || ($nameArKey !== '' && $nameArKey === $leadStageKey)
                    || ($typeKey !== '' && $typeKey === $leadStageKey)
                ) {
                    return max(0, (int) ($stage->delay_time ?? 0));
                }
            }
        }

        return 0;
    }

    private function normalizeStageKey($value): string
    {
        $s = strtolower(trim((string) ($value ?? '')));
        if ($s === '') {
            return '';
        }
        $s = str_replace(['_', '-'], ' ', $s);
        $s = preg_replace('/\s+/', ' ', $s);
        return trim((string) $s);
    }

    private function normalizeSource($source): ?string
    {
        $s = strtolower(trim((string) ($source ?? '')));
        if ($s === '') {
            return null;
        }
        $s = str_replace(['_', '-'], ' ', $s);
        $s = preg_replace('/\s+/', ' ', $s);
        return $s;
    }

    private function normalizeRegion($region): ?string
    {
        $s = trim((string) ($region ?? ''));
        if ($s === '') {
            return null;
        }
        return $s;
    }

    private function isGeneralTenant(int $tenantId): bool
    {
        try {
            $tenant = app()->bound('tenant') ? app('tenant') : Tenant::find($tenantId);
            $companyType = strtolower(trim((string) ($tenant?->company_type ?? '')));
            return $companyType === 'general';
        } catch (\Throwable $e) {
            return false;
        }
    }
}
