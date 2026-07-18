<?php

namespace App\Http\Controllers;

use App\Models\Lead;
use App\Models\Stage;
use App\Models\User;
use App\Services\TelesalesService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class TelesalesController extends Controller
{
    private const DISPLAY_STAGE_ORDER = [
        'fresh' => 1,
        'duplicate' => 2,
        'pending' => 3,
        'cold calls' => 4,
    ];

    public function __construct(private readonly TelesalesService $telesalesService)
    {
    }

    private function normalizeValue(?string $value): string
    {
        $normalized = strtolower(trim((string) $value));
        $normalized = str_replace(['_', '-'], ' ', $normalized);
        return preg_replace('/\s+/u', ' ', $normalized) ?: '';
    }

    private function requestArray(Request $request, string $key): array
    {
        $value = $request->input($key, []);

        if (is_array($value)) {
            return array_values(array_filter(array_map(static fn ($item) => is_scalar($item) ? trim((string) $item) : '', $value), static fn ($item) => $item !== ''));
        }

        if (is_scalar($value) && trim((string) $value) !== '') {
            return [trim((string) $value)];
        }

        return [];
    }

    private function isTruthySetting(mixed $value): bool
    {
        if ($value === true || $value === 1) {
            return true;
        }

        return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on'], true);
    }

    private function normalizedRole(?User $user): string
    {
        return $this->normalizeValue($user?->role ?: $user?->job_title ?: '');
    }

    private function isHigherRole(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if ($user->is_super_admin ?? false) {
            return true;
        }

        return in_array($this->normalizedRole($user), [
            'admin',
            'tenant admin',
            'director',
            'operation manager',
            'operations manager',
        ], true);
    }

    private function isTelesalesManager(?User $user): bool
    {
        return $this->normalizedRole($user) === 'telesales manager';
    }

    private function isTelesalesTeamLeader(?User $user): bool
    {
        return $this->normalizedRole($user) === 'telesales team leader';
    }

    private function isTelesalesAgent(?User $user): bool
    {
        return $this->normalizedRole($user) === 'telesales agent';
    }

    private function canViewDuplicateDisplayStage(?User $user): bool
    {
        $tenantId = (int) ($user?->tenant_id ?? 0);
        $settings = $this->telesalesService->getCrmSettings($tenantId);
        if (!$this->isTruthySetting($settings['duplicationSystem'] ?? false)) {
            return false;
        }

        $permissions = $this->telesalesService->getPermissionList($user);
        return in_array('viewDuplicateLeads', $permissions, true);
    }

    private function canViewPendingDisplayStage(?User $user, string $scope = 'all'): bool
    {
        if ($scope === 'my') {
            return false;
        }

        return !$this->isTelesalesAgent($user);
    }

    private function isDuplicateLead(Lead $lead): bool
    {
        $stage = $this->normalizeValue((string) ($lead->stage ?? ''));
        $status = $this->normalizeValue((string) ($lead->status ?? ''));

        return $stage === 'duplicate' || $status === 'duplicate';
    }

    private function isFreshLead(Lead $lead): bool
    {
        $stage = $this->normalizeValue((string) ($lead->stageRelation?->name ?? $lead->stage ?? ''));
        $type = $this->normalizeValue((string) ($lead->stageRelation?->type ?? ''));

        return in_array($stage, ['fresh', 'new', 'new lead'], true)
            || $type === 'fresh';
    }

    private function isColdCallsLead(Lead $lead): bool
    {
        $stage = $this->normalizeValue((string) ($lead->stageRelation?->name ?? $lead->stage ?? ''));
        $type = $this->normalizeValue((string) ($lead->stageRelation?->type ?? ''));

        return in_array($stage, ['cold calls', 'cold call'], true)
            || $type === 'cold calls'
            || $type === 'cold call';
    }

    private function hasNoActionSinceAssignment(Lead $lead): bool
    {
        $anchor = $lead->assigned_at ?: $lead->updated_at ?: $lead->created_at;
        $lastActionAt = $lead->last_action_at;

        if (!$lastActionAt) {
            return true;
        }

        if (!$anchor) {
            return true;
        }

        return $lastActionAt->lessThanOrEqualTo($anchor);
    }

    private function isPendingDisplayLead(Lead $lead, ?User $viewer, string $scope = 'all'): bool
    {
        if (!$this->canViewPendingDisplayStage($viewer, $scope)) {
            return false;
        }

        $assignedTo = (int) ($lead->assigned_to ?? 0);
        $viewerId = (int) ($viewer?->id ?? 0);
        $isOwner = $assignedTo > 0 && $viewerId > 0 && $assignedTo === $viewerId;
        $isUnassigned = $assignedTo <= 0;
        $status = $this->normalizeValue((string) ($lead->status ?? ''));

        if ($status === 'pending' && !$isOwner) {
            return true;
        }

        if ($isOwner || $isUnassigned) {
            return false;
        }

        if (!$this->hasNoActionSinceAssignment($lead)) {
            return false;
        }

        return $this->isFreshLead($lead) || $this->isColdCallsLead($lead);
    }

    private function resolveTelesalesStageIdForAssignment(int $tenantId, string $method, ?Lead $lead = null, bool $sameStage = false): ?int
    {
        if ($sameStage && !empty($lead?->stage_id)) {
            return (int) $lead->stage_id;
        }

        $stages = $this->telesalesService->getStagesForWorkflow($tenantId, TelesalesService::WORKFLOW_TELESALES, true);
        if ($stages->isEmpty()) {
            return !empty($lead?->stage_id) ? (int) $lead->stage_id : null;
        }

        $normalizedMethod = $this->normalizeValue($method);
        $candidateKeys = $normalizedMethod === 'cold call'
            ? ['cold calls', 'cold call']
            : ['fresh', 'new', 'new lead'];

        $matchedStage = $stages->first(function (Stage $stage) use ($candidateKeys) {
            $name = $this->normalizeValue((string) $stage->name);
            $type = $this->normalizeValue((string) $stage->type);

            return in_array($name, $candidateKeys, true) || in_array($type, $candidateKeys, true);
        });

        if ($matchedStage) {
            return (int) $matchedStage->id;
        }

        return !empty($lead?->stage_id)
            ? (int) $lead->stage_id
            : $this->telesalesService->resolveEntryStageId($tenantId, TelesalesService::WORKFLOW_TELESALES);
    }

    private function resolveDisplayStage(Lead $lead, ?User $viewer, string $scope = 'all'): string
    {
        $baseStage = trim((string) ($lead->stageRelation?->name ?? $lead->stage ?? ''));

        if ($this->isDuplicateLead($lead) && $this->canViewDuplicateDisplayStage($viewer)) {
            return 'Duplicate';
        }

        if ($this->isPendingDisplayLead($lead, $viewer, $scope)) {
            return 'Pending';
        }

        return $baseStage !== '' ? $baseStage : '-';
    }

    private function applyDisplayStageFilter($query, Request $request): void
    {
        if (!$request->filled('display_stage')) {
            return;
        }

        $displayStage = $this->normalizeValue((string) $request->input('display_stage'));
        $viewer = $request->user();
        $scope = $this->normalizeValue((string) $request->input('scope', 'all'));
        $viewerId = (int) ($viewer?->id ?? 0);
        $noActionAfterAssignmentSql = "(last_action_at IS NULL OR last_action_at <= COALESCE(assigned_at, updated_at, created_at))";

        if ($displayStage === 'duplicate') {
            if (!$this->canViewDuplicateDisplayStage($viewer)) {
                $query->whereRaw('1 = 0');
                return;
            }

            $query->where(function ($q) {
                $q->whereRaw("LOWER(COALESCE(stage, '')) = 'duplicate'")
                    ->orWhereRaw("LOWER(COALESCE(status, '')) = 'duplicate'");
            });
            return;
        }

        if ($displayStage === 'pending') {
            if (!$this->canViewPendingDisplayStage($viewer, $scope)) {
                $query->whereRaw('1 = 0');
                return;
            }

            $query->where(function ($q) use ($viewerId) {
                $q->where(function ($sub) use ($viewerId, $noActionAfterAssignmentSql) {
                    $sub->whereRaw("LOWER(COALESCE(status, '')) = 'pending'");
                    if ($viewerId > 0) {
                        $sub->where(function ($owned) use ($viewerId) {
                            $owned->whereNull('assigned_to')
                                ->orWhere('assigned_to', '!=', $viewerId);
                        });
                    }
                })->orWhere(function ($sub) use ($viewerId, $noActionAfterAssignmentSql) {
                    $sub->whereNotNull('assigned_to');
                    if ($viewerId > 0) {
                        $sub->where('assigned_to', '!=', $viewerId);
                    }
                    $sub->whereRaw($noActionAfterAssignmentSql);
                    $sub->where(function ($fresh) {
                        $fresh->whereRaw("LOWER(COALESCE(stage, '')) = 'fresh'")
                            ->orWhereRaw("LOWER(COALESCE(stage, '')) = 'new'")
                            ->orWhereRaw("LOWER(COALESCE(stage, '')) = 'new lead'")
                            ->orWhereRaw("LOWER(COALESCE(stage, '')) = 'cold calls'")
                            ->orWhereRaw("LOWER(COALESCE(stage, '')) = 'cold call'")
                            ->orWhereRaw("LOWER(COALESCE(stage, '')) = 'cold_calls'")
                            ->orWhereRaw("LOWER(COALESCE(stage, '')) = 'cold_call'");
                    });
                });
            });
            return;
        }

        $query->where(function ($q) use ($displayStage) {
            $q->whereRaw('LOWER(TRIM(COALESCE(stage, ""))) = ?', [$displayStage])
                ->orWhereHas('stageRelation', function ($stageQuery) use ($displayStage) {
                    $stageQuery->whereRaw('LOWER(TRIM(COALESCE(name, ""))) = ?', [$displayStage]);
                });
        });

        $query->where(function ($q) {
            $q->whereRaw("LOWER(COALESCE(stage, '')) != 'duplicate'")
                ->whereRaw("LOWER(COALESCE(status, '')) != 'duplicate'");
        });

        if ($this->canViewPendingDisplayStage($viewer, $scope)) {
            $query->where(function ($q) use ($viewerId, $noActionAfterAssignmentSql) {
                $q->whereRaw("LOWER(COALESCE(status, '')) != 'pending'");

                $q->where(function ($sub) use ($viewerId, $noActionAfterAssignmentSql) {
                    $sub->whereNull('assigned_to');
                    if ($viewerId > 0) {
                        $sub->orWhere('assigned_to', $viewerId);
                    }
                    $sub->orWhere(function ($nonFresh) use ($noActionAfterAssignmentSql) {
                        $nonFresh->whereRaw("NOT ({$noActionAfterAssignmentSql})")
                            ->orWhere(function ($nonFreshStage) {
                                $nonFreshStage->whereRaw("LOWER(COALESCE(stage, '')) != 'fresh'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'new'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'new lead'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'cold calls'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'cold call'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'cold_calls'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'cold_call'");
                            });
                    });
                });
            });
        }
    }

    private function excludeDisplayOnlyLeadsFromDefaultList($query, ?User $viewer, string $scope = 'all'): void
    {
        $viewerId = (int) ($viewer?->id ?? 0);
        $noActionAfterAssignmentSql = "(last_action_at IS NULL OR last_action_at <= COALESCE(assigned_at, updated_at, created_at))";

        $query->where(function ($q) {
            $q->whereRaw("LOWER(COALESCE(stage, '')) != 'duplicate'")
                ->whereRaw("LOWER(COALESCE(status, '')) != 'duplicate'");
        });

        if ($this->canViewPendingDisplayStage($viewer, $scope)) {
            $query->where(function ($q) use ($viewerId, $noActionAfterAssignmentSql) {
                $q->whereRaw("LOWER(COALESCE(status, '')) != 'pending'");

                $q->where(function ($sub) use ($viewerId, $noActionAfterAssignmentSql) {
                    $sub->whereNull('assigned_to');
                    if ($viewerId > 0) {
                        $sub->orWhere('assigned_to', $viewerId);
                    }
                    $sub->orWhere(function ($nonFresh) use ($noActionAfterAssignmentSql) {
                        $nonFresh->whereRaw("NOT ({$noActionAfterAssignmentSql})")
                            ->orWhere(function ($nonFreshStage) {
                                $nonFreshStage->whereRaw("LOWER(COALESCE(stage, '')) != 'fresh'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'new'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'new lead'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'cold calls'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'cold call'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'cold_calls'")
                                    ->whereRaw("LOWER(COALESCE(stage, '')) != 'cold_call'");
                            });
                    });
                });
            });
        }
    }

    private function applyOperationalFilters($query, Request $request): void
    {
        $sources = $this->requestArray($request, 'source');
        if (!empty($sources)) {
            $query->whereIn('source', $sources);
        }

        $priorities = array_map(fn ($item) => strtolower((string) $item), $this->requestArray($request, 'priority'));
        if (!empty($priorities)) {
            $query->whereIn('priority', $priorities);
        }

        $projectIds = array_map('intval', $this->requestArray($request, 'project'));
        $projectIds = array_values(array_filter($projectIds, static fn ($id) => $id > 0));
        if (!empty($projectIds)) {
            $query->where(function ($sub) use ($projectIds) {
                $sub->whereIn('project_id', $projectIds)
                    ->orWhereIn('item_id', $projectIds);
            });
        }

        $assignedToFilter = array_map('intval', $this->requestArray($request, 'assigned_to_filter'));
        $assignedToFilter = array_values(array_filter($assignedToFilter, static fn ($id) => $id > 0));
        if (!empty($assignedToFilter)) {
            $query->whereIn('assigned_to', $assignedToFilter);
        }

        $createdByFilter = array_map('intval', $this->requestArray($request, 'created_by_filter'));
        $createdByFilter = array_values(array_filter($createdByFilter, static fn ($id) => $id > 0));
        if (!empty($createdByFilter)) {
            $query->whereIn('created_by', $createdByFilter);
        }

        $managerFilter = array_map('intval', $this->requestArray($request, 'manager_id'));
        $managerFilter = array_values(array_filter($managerFilter, static fn ($id) => $id > 0));
        if (!empty($managerFilter)) {
            $query->whereIn('manager_id', $managerFilter);
        }

        $campaigns = $this->requestArray($request, 'campaign');
        if (!empty($campaigns) && Schema::hasColumn('leads', 'campaign')) {
            $query->whereIn('campaign', $campaigns);
        }

        $countries = $this->requestArray($request, 'country');
        if (!empty($countries)) {
            $query->whereIn('country', $countries);
        }

        $email = trim((string) $request->input('email', ''));
        if ($email !== '') {
            $query->where('email', 'like', '%' . $email . '%');
        }

        $estimatedValueMin = $request->input('estimated_value_min');
        if ($estimatedValueMin !== null && $estimatedValueMin !== '' && is_numeric($estimatedValueMin)) {
            $query->where('estimated_value', '>=', (float) $estimatedValueMin);
        }

        $assignedDateFrom = trim((string) $request->input('assigned_date_from', ''));
        $assignedDateTo = trim((string) $request->input('assigned_date_to', ''));
        if (Schema::hasColumn('leads', 'assigned_at')) {
            if ($assignedDateFrom !== '') {
                $query->whereDate('assigned_at', '>=', $assignedDateFrom);
            }
            if ($assignedDateTo !== '') {
                $query->whereDate('assigned_at', '<=', $assignedDateTo);
            }
        }

        $lastActionDateFrom = trim((string) $request->input('last_action_date_from', ''));
        $lastActionDateTo = trim((string) $request->input('last_action_date_to', ''));
        if (Schema::hasColumn('leads', 'last_action_at')) {
            if ($lastActionDateFrom !== '') {
                $query->whereDate('last_action_at', '>=', $lastActionDateFrom);
            }
            if ($lastActionDateTo !== '') {
                $query->whereDate('last_action_at', '<=', $lastActionDateTo);
            }
        }

        $createdFrom = trim((string) $request->input('created_from', ''));
        $createdTo = trim((string) $request->input('created_to', ''));
        if ($createdFrom !== '') {
            $query->whereDate('created_at', '>=', $createdFrom);
        }
        if ($createdTo !== '') {
            $query->whereDate('created_at', '<=', $createdTo);
        }

        $actionDateFrom = trim((string) $request->input('action_date_from', ''));
        $actionDateTo = trim((string) $request->input('action_date_to', ''));
        if ($actionDateFrom !== '' || $actionDateTo !== '') {
            $query->whereHas('actions', function ($actionQuery) use ($actionDateFrom, $actionDateTo) {
                if ($actionDateFrom !== '') {
                    $actionQuery->whereDate('lead_actions.created_at', '>=', $actionDateFrom);
                }
                if ($actionDateTo !== '') {
                    $actionQuery->whereDate('lead_actions.created_at', '<=', $actionDateTo);
                }
            });
        }

        $actionTypes = $this->requestArray($request, 'action_type');
        if (!empty($actionTypes)) {
            $query->whereHas('actions', function ($actionQuery) use ($actionTypes) {
                $actionQuery->whereIn('lead_actions.action_type', $actionTypes);
            });
        }
    }

    private function hasLeadWorkflowColumns(): bool
    {
        return Schema::hasColumn('leads', 'workflow_key')
            && Schema::hasColumn('leads', 'stage_id')
            && Schema::hasColumn('leads', 'transferred_to_sales_at');
    }

    private function emptyPaginator(Request $request)
    {
        $perPage = (int) $request->input('per_page', 20);

        return response()->json([
            'current_page' => 1,
            'data' => [],
            'first_page_url' => null,
            'from' => null,
            'last_page' => 1,
            'last_page_url' => null,
            'links' => [],
            'next_page_url' => null,
            'path' => $request->url(),
            'per_page' => $perPage,
            'prev_page_url' => null,
            'to' => null,
            'total' => 0,
        ]);
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $tenant = $this->telesalesService->getTenantForUser($user);

        if ($this->telesalesService->isEnabledForTenant($tenant)) {
            $this->telesalesService->ensureOperationalAccess($user, 'showModule');
        } else {
            $this->telesalesService->ensureHistoricalAccess($user);
        }

        if (!$this->hasLeadWorkflowColumns()) {
            return $this->emptyPaginator($request);
        }

        $query = Lead::query()
            ->with(['assignedAgent:id,name', 'creator:id,name', 'stageRelation:id,name,type,workflow_key'])
            ->when($user?->tenant_id, fn ($q) => $q->where('tenant_id', (int) $user->tenant_id))
            ->where('workflow_key', TelesalesService::WORKFLOW_TELESALES)
            ->orderByDesc('updated_at');

        if (!$this->canViewDuplicateDisplayStage($user)) {
            $query->where(function ($q) {
                $q->whereRaw("LOWER(COALESCE(stage, '')) != 'duplicate'")
                    ->whereRaw("LOWER(COALESCE(status, '')) != 'duplicate'");
            });
        }

        if ($request->filled('assigned_to')) {
            $query->where('assigned_to', (int) $request->input('assigned_to'));
        }

        if ($request->boolean('referral_only')) {
            $query->whereHas('referralUsers');
        }

        if ($request->filled('historical_only')) {
            $query->whereNotNull('transferred_to_sales_at');
        }

        $this->applyOperationalFilters($query, $request);

        $scope = $this->normalizeValue((string) $request->input('scope', 'all'));

        $displayStages = $this->requestArray($request, 'display_stage');
        if (!empty($displayStages)) {
            $query->where(function ($stageGroup) use ($displayStages, $request) {
                foreach ($displayStages as $displayStage) {
                    $stageGroup->orWhere(function ($stageQuery) use ($displayStage, $request) {
                        $nestedRequest = $request->duplicate();
                        $nestedRequest->merge(['display_stage' => $displayStage]);
                        $nestedRequest->setUserResolver(fn () => $request->user());
                        $this->applyDisplayStageFilter($stageQuery, $nestedRequest);
                    });
                }
            });
        } elseif ($request->filled('stage_id')) {
            $query->where('stage_id', (int) $request->input('stage_id'));
        } else {
            $this->excludeDisplayOnlyLeadsFromDefaultList($query, $user, $scope);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', '%' . $search . '%')
                    ->orWhere('phone', 'like', '%' . $search . '%')
                    ->orWhere('email', 'like', '%' . $search . '%')
                    ->orWhere('company', 'like', '%' . $search . '%');
            });
        }

        $results = $query->paginate((int) $request->input('per_page', 20));
        $results->getCollection()->transform(function (Lead $lead) use ($user, $scope) {
            $lead->display_stage = $this->resolveDisplayStage($lead, $user, $scope);
            return $lead;
        });

        return response()->json($results);
    }

    public function dashboardSummary(Request $request)
    {
        $this->telesalesService->ensureOperationalAccess($request->user(), 'viewDashboard');

        if (!$this->hasLeadWorkflowColumns() || !Schema::hasColumn('stages', 'workflow_key')) {
            return response()->json([
                'total_leads' => 0,
                'assigned_to_sales' => 0,
                'by_stage' => [],
                'follow_ups_today' => 0,
                'calls_today' => 0,
            ]);
        }

        $tenantId = (int) ($request->user()?->tenant_id ?? 0);
        $scope = $this->normalizeValue((string) $request->input('scope', 'all'));
        $query = $this->telesalesService->getActiveTelesalesLeadsQuery($tenantId)
            ->with(['stageRelation:id,name,type,workflow_key']);

        if ($scope === 'my') {
            $query->where('assigned_to', (int) ($request->user()?->id ?? 0));
        }

        if ($request->boolean('referral_only')) {
            $query->whereHas('referralUsers');
        }

        $this->applyOperationalFilters($query, $request);

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', '%' . $search . '%')
                    ->orWhere('phone', 'like', '%' . $search . '%')
                    ->orWhere('email', 'like', '%' . $search . '%')
                    ->orWhere('company', 'like', '%' . $search . '%');
            });
        }

        $leads = $query->get();
        $byStageMap = [];
        $duplicateCount = 0;

        foreach ($leads as $lead) {
            if ($this->isDuplicateLead($lead)) {
                $duplicateCount++;
                if (!$this->canViewDuplicateDisplayStage($request->user())) {
                    continue;
                }
            }

            $displayStage = $this->resolveDisplayStage($lead, $request->user(), $scope);
            $displayKey = $this->normalizeValue($displayStage);
            if ($displayKey === '') {
                continue;
            }

            if (!isset($byStageMap[$displayKey])) {
                $byStageMap[$displayKey] = [
                    'stage_key' => $displayKey,
                    'stage_name' => $displayStage,
                    'count' => 0,
                ];
            }
            $byStageMap[$displayKey]['count']++;
        }

        $byStage = array_values($byStageMap);
        usort($byStage, function ($a, $b) {
            $aKey = $this->normalizeValue((string) ($a['stage_key'] ?? $a['stage_name'] ?? ''));
            $bKey = $this->normalizeValue((string) ($b['stage_key'] ?? $b['stage_name'] ?? ''));

            $aPriority = self::DISPLAY_STAGE_ORDER[$aKey] ?? PHP_INT_MAX;
            $bPriority = self::DISPLAY_STAGE_ORDER[$bKey] ?? PHP_INT_MAX;

            if ($aPriority !== $bPriority) {
                return $aPriority <=> $bPriority;
            }

            return strcmp((string) ($a['stage_name'] ?? ''), (string) ($b['stage_name'] ?? ''));
        });

        $totalLeads = 0;
        foreach ($byStage as $item) {
            if (($item['stage_key'] ?? '') === 'duplicate') {
                continue;
            }
            $totalLeads += (int) ($item['count'] ?? 0);
        }

        return response()->json([
            'total_leads' => $totalLeads,
            'assigned_to_sales' => $leads->whereNotNull('transferred_to_sales_at')->count(),
            'duplicate' => $this->canViewDuplicateDisplayStage($request->user()) ? $duplicateCount : 0,
            'pending' => (int) ($byStageMap['pending']['count'] ?? 0),
            'by_stage' => $byStage,
            'follow_ups_today' => 0,
            'calls_today' => 0,
        ]);
    }

    public function moduleDisableCheck(Request $request)
    {
        $this->telesalesService->ensureOperationalAccess($request->user(), 'disableModule');

        if (!$this->hasLeadWorkflowColumns()) {
            return response()->json([
                'active_leads_count' => 0,
                'sample_leads' => [],
                'can_bulk_transfer' => $this->telesalesService->userHasPermission($request->user(), 'bulkTransferToSales'),
            ]);
        }

        $tenantId = (int) ($request->user()?->tenant_id ?? 0);
        $activeQuery = $this->telesalesService->getActiveTelesalesLeadsQuery($tenantId)
            ->whereNull('transferred_to_sales_at');

        return response()->json([
            'active_leads_count' => (clone $activeQuery)->count(),
            'sample_leads' => (clone $activeQuery)->limit(10)->get(['id', 'name', 'phone', 'stage', 'stage_id', 'assigned_to']),
            'can_bulk_transfer' => $this->telesalesService->userHasPermission($request->user(), 'bulkTransferToSales'),
        ]);
    }

    public function assignees(Request $request)
    {
        $this->telesalesService->ensureOperationalAccess($request->user(), 'showModule');

        $tenantId = (int) ($request->user()?->tenant_id ?? 0);
        $workflow = strtolower(trim((string) $request->input('workflow', TelesalesService::WORKFLOW_TELESALES)));

        $collection = $workflow === TelesalesService::WORKFLOW_SALES
            ? $this->telesalesService->getEligibleSalesAssignees($tenantId)
            : $this->telesalesService->getEligibleTelesalesAssignees($tenantId);

        return response()->json($collection->map(fn (User $user) => [
            'id' => $user->id,
            'name' => $user->name,
            'role' => $user->role,
            'job_title' => $user->job_title,
            'manager_id' => $user->manager_id,
            'status' => $user->status,
        ])->values());
    }

    public function transferToSales(Request $request, int $leadId)
    {
        if (!$this->hasLeadWorkflowColumns()) {
            return response()->json([
                'message' => 'Telesales workflow columns are not available yet. Please run the latest CRM migrations first.',
            ], 409);
        }

        $request->validate([
            'sales_entry_stage_id' => 'nullable|integer|exists:stages,id',
            'assignment_method' => 'required|in:direct,rotation',
            'assigned_to' => 'nullable|integer|exists:users,id',
        ]);

        $lead = Lead::query()->where('workflow_key', TelesalesService::WORKFLOW_TELESALES)->findOrFail($leadId);
        $lead = $this->telesalesService->transferLeadToSales($lead, $request->user(), $request->all());

        return response()->json([
            'message' => 'Lead transferred to sales successfully.',
            'lead' => $lead,
        ]);
    }

    public function bulkAssign(Request $request)
    {
        $this->telesalesService->ensureOperationalAccess($request->user(), 'assignLead');

        if (!$this->hasLeadWorkflowColumns()) {
            return response()->json([
                'message' => 'Telesales workflow columns are not available yet. Please run the latest CRM migrations first.',
            ], 409);
        }

        $request->validate([
            'lead_ids' => 'required|array|min:1',
            'lead_ids.*' => 'integer|exists:leads,id',
            'assigned_to' => 'required|integer|exists:users,id',
            'assign_role' => 'nullable|in:sales,manager',
            'method' => 'nullable|in:fresh,cold_call',
            'options' => 'nullable|array',
            'options.sameStage' => 'nullable|boolean',
            'options.clearHistory' => 'nullable|boolean',
        ]);

        $tenantId = (int) ($request->user()?->tenant_id ?? 0);
        $assignee = $this->telesalesService->validateTelesalesAssigneeId($tenantId, (int) $request->input('assigned_to'));
        $leadIds = collect($request->input('lead_ids', []))->map(fn ($id) => (int) $id)->filter()->values()->all();
        $assignRole = $this->normalizeValue((string) $request->input('assign_role', 'sales')) === 'manager' ? 'manager' : 'sales';
        $assignMethod = $this->normalizeValue((string) $request->input('method', 'fresh'));
        $options = (array) $request->input('options', []);

        $leads = $this->telesalesService->getActiveTelesalesLeadsQuery($tenantId)
            ->whereIn('id', $leadIds)
            ->get();

        foreach ($leads as $lead) {
            $oldStageId = $lead->stage_id;
            $nextStageId = $this->resolveTelesalesStageIdForAssignment(
                $tenantId,
                $assignMethod,
                $lead,
                (bool) ($options['sameStage'] ?? false)
            );

            if ($assignRole === 'manager') {
                $lead->manager_id = $assignee?->id;
                $lead->assigned_to = null;
                $lead->sales_person = null;
            } else {
                $lead->assigned_to = $assignee?->id;
                $lead->sales_person = $assignee?->name;
                if (Schema::hasColumn('leads', 'assigned_at')) {
                    $lead->assigned_at = now();
                }
                if (!empty($assignee?->manager_id)) {
                    $lead->manager_id = $assignee->manager_id;
                }
            }
            if (!empty($nextStageId)) {
                $lead->stage_id = (int) $nextStageId;
                $this->telesalesService->syncLeadStageFields($lead);
            }
            $lead->save();

            $this->telesalesService->appendWorkflowHistory($lead, $request->user(), [
                'from_workflow' => TelesalesService::WORKFLOW_TELESALES,
                'to_workflow' => TelesalesService::WORKFLOW_TELESALES,
                'from_stage_id' => $oldStageId,
                'to_stage_id' => $lead->stage_id,
                'action' => 'lead_reassigned',
                'meta_data' => [
                    'assigned_to' => $assignee?->id,
                    'assigned_to_name' => $assignee?->name,
                    'assign_role' => $assignRole,
                    'method' => $assignMethod,
                    'options' => $options,
                ],
            ]);
        }

        return response()->json([
            'message' => 'Telesales leads assigned successfully.',
            'assigned_count' => $leads->count(),
        ]);
    }

    public function bulkTransferToSales(Request $request)
    {
        $this->telesalesService->ensureOperationalAccess($request->user(), 'bulkTransferToSales');

        if (!$this->hasLeadWorkflowColumns()) {
            return response()->json([
                'message' => 'Telesales workflow columns are not available yet. Please run the latest CRM migrations first.',
            ], 409);
        }

        $request->validate([
            'lead_ids' => 'nullable|array',
            'lead_ids.*' => 'integer|exists:leads,id',
            'all_active' => 'nullable|boolean',
            'sales_entry_stage_id' => 'nullable|integer|exists:stages,id',
            'assignment_method' => 'required|in:direct,rotation',
            'assigned_to' => 'nullable|integer|exists:users,id',
        ]);

        $tenantId = (int) ($request->user()?->tenant_id ?? 0);
        $query = $this->telesalesService->getActiveTelesalesLeadsQuery($tenantId)
            ->whereNull('transferred_to_sales_at');

        if (!$request->boolean('all_active')) {
            $leadIds = collect($request->input('lead_ids', []))->map(fn ($id) => (int) $id)->filter()->values()->all();
            $query->whereIn('id', $leadIds);
        }

        $leads = $query->get();
        $transferred = [];
        foreach ($leads as $lead) {
            $transferred[] = $this->telesalesService->transferLeadToSales($lead, $request->user(), $request->all());
        }

        return response()->json([
            'message' => 'Bulk transfer completed successfully.',
            'transferred_count' => count($transferred),
            'leads' => $transferred,
        ]);
    }

    public function historical(Request $request)
    {
        $this->telesalesService->ensureHistoricalAccess($request->user());

        if (!$this->hasLeadWorkflowColumns()) {
            return $this->emptyPaginator($request);
        }

        $query = Lead::query()
            ->with(['assignedAgent:id,name', 'creator:id,name', 'stageRelation:id,name,workflow_key'])
            ->when($request->user()?->tenant_id, fn ($q) => $q->where('tenant_id', (int) $request->user()->tenant_id))
            ->where(function ($q) {
                $q->where('workflow_key', TelesalesService::WORKFLOW_TELESALES)
                    ->orWhereNotNull('transferred_to_sales_at');
            })
            ->orderByDesc('updated_at');

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', '%' . $search . '%')
                    ->orWhere('phone', 'like', '%' . $search . '%')
                    ->orWhere('email', 'like', '%' . $search . '%')
                    ->orWhere('company', 'like', '%' . $search . '%');
            });
        }

        return response()->json($query->paginate((int) $request->input('per_page', 20)));
    }
}
