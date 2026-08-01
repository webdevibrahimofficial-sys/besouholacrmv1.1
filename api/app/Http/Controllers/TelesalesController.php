<?php

namespace App\Http\Controllers;

use App\Http\Resources\TelesalesDashboardSummaryResource;
use App\Http\Resources\TelesalesLeadResource;
use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\LeadWorkflowHistory;
use App\Models\Stage;
use App\Models\User;
use App\Notifications\LeadAssigned;
use App\Services\Telesales\TelesalesDashboardSummaryBuilder;
use App\Services\Telesales\TelesalesLeadViewService;
use App\Services\TelesalesService;
use App\Traits\ResolvesNotificationRecipients;
use App\Traits\UserHierarchyTrait;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Schema;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Illuminate\Support\Collection;

class TelesalesController extends Controller
{
    use UserHierarchyTrait;
    use ResolvesNotificationRecipients;

    public function __construct(
        private readonly TelesalesService $telesalesService,
        private readonly TelesalesLeadViewService $leadViewService,
        private readonly TelesalesDashboardSummaryBuilder $dashboardSummaryBuilder,
    ) {}

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

    private function resolveDelayedActionSchedule(array $details, ?string $actionType, ?string $nextActionType): array
    {
        $meetingStatus = strtolower(trim((string) ($details['meeting_status'] ?? '')));
        $isMeetingAction = strtolower(trim((string) ($actionType ?? ''))) === 'meeting'
            || strtolower(trim((string) ($nextActionType ?? ''))) === 'meeting';

        if ($isMeetingAction && in_array($meetingStatus, ['done', 'no_show'], true)) {
            $nextDate = trim((string) ($details['next_action_date'] ?? $details['nextActionDate'] ?? ''));
            $nextTime = trim((string) ($details['next_action_time'] ?? $details['nextActionTime'] ?? ''));
            if ($nextDate !== '') {
                return [$nextDate, $nextTime !== '' ? $nextTime : '00:00'];
            }
        }

        $date = trim((string) ($details['date'] ?? ''));
        $time = trim((string) ($details['time'] ?? ''));

        return [$date, $time !== '' ? $time : '00:00'];
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

    private function applyTelesalesActorScope($query, int $userId): void
    {
        $query->where(function ($scopeQuery) use ($userId) {
            $scopeQuery->where('assigned_to', $userId)
                ->orWhere('manager_id', $userId)
                ->orWhereHas('latestTransferToSalesHistory', function ($historyQuery) use ($userId) {
                    $historyQuery->where('performed_by', $userId);
                });
        });
    }

    private function applyTelesalesViewerScope($query, ?User $user): void
    {
        if (!$user) {
            return;
        }

        $viewerId = (int) ($user->id ?? 0);
        if ($viewerId <= 0) {
            return;
        }

        if ($this->leadViewService->shouldForceAssignedScope($user)) {
            $this->applyTelesalesActorScope($query, $viewerId);
            return;
        }

        $viewableUserIds = $this->getViewableUserIds($user);
        if ($viewableUserIds === null) {
            return;
        }

        $visibleIds = array_values(array_unique(array_map('intval', array_filter(
            $viewableUserIds,
            static fn ($id) => (int) $id > 0
        ))));

        if (empty($visibleIds)) {
            $visibleIds = [$viewerId];
        }

        $query->where(function ($scopeQuery) use ($visibleIds) {
            $scopeQuery->whereIn('assigned_to', $visibleIds)
                ->orWhereIn('manager_id', $visibleIds)
                ->orWhereHas('latestTransferToSalesHistory', function ($historyQuery) use ($visibleIds) {
                    $historyQuery->whereIn('performed_by', $visibleIds);
                });
        });
    }

    private function getScopedUserIdsForViewer(?User $user): ?array
    {
        if (!$user) {
            return [];
        }

        $viewerId = (int) ($user->id ?? 0);
        if ($viewerId <= 0) {
            return [];
        }

        if ($this->leadViewService->shouldForceAssignedScope($user)) {
            return [$viewerId];
        }

        $viewableUserIds = $this->getViewableUserIds($user);
        if ($viewableUserIds === null) {
            return null;
        }

        $visibleIds = array_values(array_unique(array_map('intval', array_filter(
            $viewableUserIds,
            static fn ($id) => (int) $id > 0
        ))));

        return !empty($visibleIds) ? $visibleIds : [$viewerId];
    }

    private function filterAssigneesForViewer(Collection $users, ?User $viewer): Collection
    {
        $scopedIds = $this->getScopedUserIdsForViewer($viewer);
        if ($scopedIds === null) {
            return $users->values();
        }

        $allowedIds = array_flip($scopedIds);

        return $users
            ->filter(fn (User $user) => isset($allowedIds[(int) $user->id]))
            ->values();
    }

    private function ensureViewerCanAssignToUser(?User $viewer, int $assigneeId): void
    {
        $scopedIds = $this->getScopedUserIdsForViewer($viewer);
        if ($scopedIds === null) {
            return;
        }

        if (!in_array($assigneeId, $scopedIds, true)) {
            abort(403, 'You can only assign telesales leads to users within your scope.');
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

        $convertByFilter = array_map('intval', $this->requestArray($request, 'convert_by_filter'));
        $convertByFilter = array_values(array_filter($convertByFilter, static fn ($id) => $id > 0));
        if (!empty($convertByFilter)) {
            $query->whereHas('latestTransferToSalesHistory', function ($historyQuery) use ($convertByFilter) {
                $historyQuery->whereIn('performed_by', $convertByFilter);
            });
        }

        $convertToFilter = array_map('intval', $this->requestArray($request, 'convert_to_filter'));
        $convertToFilter = array_values(array_filter($convertToFilter, static fn ($id) => $id > 0));
        if (!empty($convertToFilter)) {
            $query->whereHas('latestTransferToSalesHistory', function ($historyQuery) use ($convertToFilter) {
                $historyQuery->where(function ($sub) use ($convertToFilter) {
                    foreach ($convertToFilter as $targetId) {
                        $sub->orWhere('meta_data->assigned_to', $targetId);
                    }
                });
            });
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

    private function buildOperationalLeadsQuery(Request $request, bool $forExport = false)
    {
        $user = $request->user();
        $displayStages = array_map(fn ($item) => $this->normalizeValue((string) $item), $this->requestArray($request, 'display_stage'));
        $includeConvertedLeads = in_array('convert', $displayStages, true);

        $relations = $forExport
            ? [
                'assignedAgent:id,name',
                'creator:id,name',
                'manager:id,name',
                'stageRelation:id,name,type,workflow_key',
                'latestTransferToSalesHistory' => function ($query) {
                    $query->select([
                        'lead_workflow_history.id',
                        'lead_workflow_history.lead_id',
                        'lead_workflow_history.from_stage_id',
                        'lead_workflow_history.to_stage_id',
                        'lead_workflow_history.performed_by',
                        'lead_workflow_history.meta_data',
                        'lead_workflow_history.created_at',
                    ])->with([
                        'fromStage:id,name,workflow_key',
                        'toStage:id,name,workflow_key',
                    ]);
                },
                'latestTransferToSalesHistory.performedByUser:id,name',
                'campaignRelation:id,name',
            ]
            : [
                'assignedAgent:id,name',
                'creator:id,name',
                'stageRelation:id,name,type,workflow_key',
                'latestTransferToSalesHistory' => function ($query) {
                    $query->select([
                        'lead_workflow_history.id',
                        'lead_workflow_history.lead_id',
                        'lead_workflow_history.from_stage_id',
                        'lead_workflow_history.to_stage_id',
                        'lead_workflow_history.performed_by',
                        'lead_workflow_history.meta_data',
                    ])->with([
                        'fromStage:id,name,workflow_key',
                        'toStage:id,name,workflow_key',
                    ]);
                },
                'latestTransferToSalesHistory.performedByUser:id,name',
                'latestAction' => function ($query) {
                    $query->select([
                        'lead_actions.id',
                        'lead_actions.lead_id',
                        'lead_actions.user_id',
                        'lead_actions.action_type',
                        'lead_actions.next_action_type',
                        'lead_actions.description',
                        'lead_actions.details',
                        'lead_actions.created_at',
                    ]);
                },
                'latestAction.user:id,name',
            ];

        $query = Lead::query()
            ->with($relations)
            ->when($user?->tenant_id, fn ($q) => $q->where('tenant_id', (int) $user->tenant_id))
            ->where(function ($workflowQuery) use ($includeConvertedLeads) {
                $workflowQuery->where('workflow_key', TelesalesService::WORKFLOW_TELESALES);
                if ($includeConvertedLeads) {
                    $workflowQuery->orWhereNotNull('transferred_to_sales_at');
                }
            })
            ->orderByDesc('updated_at');

        $this->applyTelesalesViewerScope($query, $user);

        if (!$this->leadViewService->canViewDuplicateDisplayStage($user)) {
            $query->where(function ($q) {
                $q->whereRaw("LOWER(COALESCE(stage, '')) != 'duplicate'")
                    ->whereRaw("LOWER(COALESCE(status, '')) != 'duplicate'");
            });
        }

        if ($request->filled('assigned_to')) {
            $this->applyTelesalesActorScope($query, (int) $request->input('assigned_to'));
        }

        if ($request->boolean('referral_only')) {
            $query->whereHas('referralUsers');
        }

        if ($request->filled('historical_only')) {
            $query->whereNotNull('transferred_to_sales_at');
        }

        $selectedLeadIds = array_map('intval', $this->requestArray($request, 'lead_ids'));
        $selectedLeadIds = array_values(array_filter($selectedLeadIds, static fn ($id) => $id > 0));
        if (!empty($selectedLeadIds)) {
            $query->whereIn('id', $selectedLeadIds);
        }

        $this->applyOperationalFilters($query, $request);

        $scope = $this->normalizeValue((string) $request->input('scope', 'all'));

        if (!empty($displayStages)) {
            $query->where(function ($stageGroup) use ($displayStages, $request) {
                foreach ($displayStages as $displayStage) {
                    $stageGroup->orWhere(function ($stageQuery) use ($displayStage, $request) {
                        $nestedRequest = $request->duplicate();
                        $nestedRequest->merge(['display_stage' => $displayStage]);
                        $nestedRequest->setUserResolver(fn () => $request->user());
                        $this->leadViewService->applyDisplayStageFilter($stageQuery, $nestedRequest);
                    });
                }
            });
        } elseif ($request->filled('stage_id')) {
            $query->where('stage_id', (int) $request->input('stage_id'));
        } else {
            $this->leadViewService->excludeDisplayOnlyLeadsFromDefaultList($query, $user, $scope);
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

        return $query;
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
        $query = $this->buildOperationalLeadsQuery($request);

        $results = $query->paginate((int) $request->input('per_page', 20));
        $scope = $this->normalizeValue((string) $request->input('scope', 'all'));
        $results->getCollection()->transform(function (Lead $lead) use ($user, $scope) {
            return $this->leadViewService->decorateLead($lead, $user, $scope);
        });

        return TelesalesLeadResource::collection($results);
    }

    public function dashboardSummary(Request $request)
    {
        $viewer = $request->user();
        $this->telesalesService->ensureOperationalAccess($viewer, 'showModule');

        if (!$this->hasLeadWorkflowColumns() || !Schema::hasColumn('stages', 'workflow_key')) {
            return new TelesalesDashboardSummaryResource([
                'total_leads' => 0,
                'assigned_to_sales' => 0,
                'by_stage' => [],
                'follow_ups_today' => 0,
                'calls_today' => 0,
            ]);
        }

        $tenantId = (int) ($viewer?->tenant_id ?? 0);
        $scope = $this->normalizeValue((string) $request->input('scope', 'all'));
        $query = Lead::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->whereNull('deleted_at')
            ->where(function ($workflowQuery) {
                $workflowQuery->where('workflow_key', TelesalesService::WORKFLOW_TELESALES)
                    ->orWhereNotNull('transferred_to_sales_at');
            })
            ->with(['stageRelation:id,name,type,workflow_key']);

        if ($scope === 'my') {
            $viewerId = (int) ($viewer?->id ?? 0);
            $this->applyTelesalesActorScope($query, $viewerId);
        } else {
            $this->applyTelesalesViewerScope($query, $viewer);
        }

        if ($request->boolean('referral_only')) {
            $query->whereHas('referralUsers');
        }

        $this->applyOperationalFilters($query, $request);

        $displayStages = $this->requestArray($request, 'display_stage');
        if (!empty($displayStages)) {
            $query->where(function ($stageGroup) use ($displayStages, $request) {
                foreach ($displayStages as $displayStage) {
                    $stageGroup->orWhere(function ($stageQuery) use ($displayStage, $request) {
                        $nestedRequest = $request->duplicate();
                        $nestedRequest->merge(['display_stage' => $displayStage]);
                        $nestedRequest->setUserResolver(fn () => $request->user());
                        $this->leadViewService->applyDisplayStageFilter($stageQuery, $nestedRequest);
                    });
                }
            });
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

        return new TelesalesDashboardSummaryResource(
            $this->dashboardSummaryBuilder->build($query->get(), $viewer, $scope)
        );
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
            ? $this->telesalesService->getEligibleConvertedTelesalesSalesAssignees($tenantId)
            : $this->telesalesService->getEligibleTelesalesAssignees($tenantId);

        $collection = $this->filterAssigneesForViewer($collection, $request->user());

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
            'assign_role' => 'nullable|in:sales,manager',
            'stage' => 'nullable|string|in:same_stage,new_lead,cold_calls',
            'history_option' => 'nullable|string|in:keep_history,assign_as_new',
            'options' => 'nullable|array',
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
        $this->ensureViewerCanAssignToUser($request->user(), (int) ($assignee?->id ?? 0));
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

                $assigneeRole = $this->telesalesService->normalizedRole($assignee);
                $isLeadershipAssignee = in_array($assigneeRole, ['telesales manager', 'telesales team leader'], true);
                if ($isLeadershipAssignee) {
                    $lead->manager_id = $assignee?->id;
                } elseif (!empty($assignee?->manager_id)) {
                    $lead->manager_id = $assignee->manager_id;
                } else {
                    $lead->manager_id = null;
                }
            }
            if (!empty($nextStageId)) {
                $lead->stage_id = (int) $nextStageId;
                $this->telesalesService->syncLeadStageFields($lead);
            }

            $resetStage = null;
            if (!(bool) ($options['sameStage'] ?? false)) {
                $resetStage = $assignMethod === 'cold_call' ? 'cold_calls' : 'new_lead';
            }
            $this->telesalesService->resetLeadFollowUpOnReassignment($lead, $request->user(), $resetStage);

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

            if ($assignRole !== 'manager' && $lead->assigned_to) {
                $assigneeRecipient = User::with(['manager', 'team.leader'])->find($lead->assigned_to);
                $actor = $request->user();
                if ($assigneeRecipient && $actor) {
                    $notificationLead = $lead->fresh(['assignedAgent:id,name', 'creator:id,name']);
                    $notification = new LeadAssigned($notificationLead, $actor->name);
                    $recipients = $this->buildNotificationRecipients(
                        $assigneeRecipient,
                        [
                            'owner' => $notificationLead->creator,
                            'assignee' => $assigneeRecipient,
                            'assigner' => $actor,
                        ],
                        TelesalesService::MODULE_SLUG,
                        'notify_assigned_leads'
                    );

                    foreach ($recipients as $userRecipient) {
                        try {
                            $userRecipient->notify($notification);
                        } catch (\Throwable $e) {
                        }
                    }
                }
            }
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
            'stage' => 'nullable|string|in:same_stage,new_lead,cold_calls',
            'history_option' => 'nullable|string|in:keep_history,assign_as_new',
            'options' => 'nullable|array',
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

        $convertedOnly = filter_var($request->input('converted_only', false), FILTER_VALIDATE_BOOLEAN);

        $query = Lead::query()
            ->with([
                'assignedAgent:id,name',
                'creator:id,name',
                'stageRelation:id,name,workflow_key',
                'actions' => function ($query) {
                    $query->select([
                        'lead_actions.id',
                        'lead_actions.lead_id',
                        'lead_actions.user_id',
                        'lead_actions.action_type',
                        'lead_actions.next_action_type',
                        'lead_actions.description',
                        'lead_actions.details',
                        'lead_actions.created_at',
                    ])->orderByDesc('lead_actions.created_at');
                },
                'actions.user:id,name',
                'latestTransferToSalesHistory' => function ($query) {
                    $query->select([
                        'lead_workflow_history.id',
                        'lead_workflow_history.lead_id',
                        'lead_workflow_history.from_stage_id',
                        'lead_workflow_history.to_stage_id',
                        'lead_workflow_history.performed_by',
                        'lead_workflow_history.meta_data',
                        'lead_workflow_history.created_at',
                    ])->with([
                        'fromStage:id,name,workflow_key',
                        'toStage:id,name,workflow_key',
                    ]);
                },
                'latestTransferToSalesHistory.performedByUser:id,name',
                'latestAction' => function ($query) {
                    $query->select([
                        'lead_actions.id',
                        'lead_actions.lead_id',
                        'lead_actions.user_id',
                        'lead_actions.action_type',
                        'lead_actions.next_action_type',
                        'lead_actions.description',
                        'lead_actions.details',
                        'lead_actions.created_at',
                    ]);
                },
                'latestAction.user:id,name',
            ])
            ->when($request->user()?->tenant_id, fn ($q) => $q->where('tenant_id', (int) $request->user()->tenant_id))
            ->where(function ($q) use ($convertedOnly) {
                if ($convertedOnly) {
                    $q->whereNotNull('transferred_to_sales_at');
                    return;
                }

                $q->where('workflow_key', TelesalesService::WORKFLOW_TELESALES)
                    ->orWhereNotNull('transferred_to_sales_at');
            })
            ->orderByDesc('updated_at');

        $scope = $this->normalizeValue((string) $request->input('scope', 'all'));

        if ($scope === 'my') {
            $viewerId = (int) ($request->user()?->id ?? 0);
            $this->applyTelesalesActorScope($query, $viewerId);
        } else {
            $this->applyTelesalesViewerScope($query, $request->user());
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
        $results->getCollection()->transform(function (Lead $lead) use ($request, $scope) {
            return $this->leadViewService->decorateLead(
                $lead,
                $request->user(),
                $scope
            );
        });

        return TelesalesLeadResource::collection($results);
    }

    public function delayed(Request $request)
    {
        try {
            $user = $request->user();
            $tenantId = (int) ($user?->tenant_id ?? 0);
            $eligibleStatuses = ['scheduled', 'Scheduled', 'pending', 'in_progress', 'in-progress', 'in progress'];

            $query = $this->telesalesService->getActiveTelesalesLeadsQuery($tenantId)
                ->whereDoesntHave('referralUsers')
                ->whereHas('actions', function ($actionQuery) use ($eligibleStatuses) {
                    $actionQuery->whereIn('details->status', $eligibleStatuses)
                        ->whereNotIn('action_type', ['closing_deals', 'cancel'])
                        ->whereNotIn('next_action_type', ['closing_deals', 'cancel'])
                        ->whereNotNull('details->date')
                        ->where('details->date', '!=', '');
                })
                ->with([
                    'assignedAgent:id,name',
                    'stageRelation:id,name,name_ar,type,workflow_key',
                    'actions' => function ($actionQuery) use ($eligibleStatuses) {
                        $actionQuery->select([
                            'lead_actions.id',
                            'lead_actions.lead_id',
                            'lead_actions.user_id',
                            'lead_actions.action_type',
                            'lead_actions.next_action_type',
                            'lead_actions.description',
                            'lead_actions.details',
                            'lead_actions.stage_id_at_creation',
                            'lead_actions.created_at',
                        ])
                            ->whereIn('details->status', $eligibleStatuses)
                            ->whereNotIn('action_type', ['closing_deals', 'cancel'])
                            ->whereNotIn('next_action_type', ['closing_deals', 'cancel'])
                            ->whereNotNull('details->date')
                            ->where('details->date', '!=', '')
                            ->orderByDesc('lead_actions.created_at');
                    },
                    'actions.user:id,name',
                    'latestAction' => function ($actionQuery) {
                        $actionQuery->select([
                            'lead_actions.id',
                            'lead_actions.lead_id',
                            'lead_actions.user_id',
                            'lead_actions.action_type',
                            'lead_actions.next_action_type',
                            'lead_actions.description',
                            'lead_actions.details',
                            'lead_actions.created_at',
                        ]);
                    },
                    'latestAction.user:id,name',
                ]);

            $this->applyTelesalesViewerScope($query, $user);

            if ($request->filled('assigned_to')) {
                $query->where('assigned_to', (int) $request->input('assigned_to'));
            }

            $perPage = (int) $request->input('per_page', 20);
            $page = max(1, (int) $request->input('page', 1));
            $now = \Carbon\Carbon::now(config('app.timezone'));

            $candidates = $query->limit(2000)->get();
            $filtered = [];

            foreach ($candidates as $lead) {
                $latest = $lead->actions->first();
                if (!$latest) {
                    continue;
                }

                $details = is_array($latest->details ?? null) ? ($latest->details ?? []) : (json_decode($latest->details, true) ?? []);
                [$date, $time] = $this->resolveDelayedActionSchedule(
                    $details,
                    $latest->action_type ?? null,
                    $latest->next_action_type ?? null
                );
                if ($date === '') {
                    continue;
                }

                try {
                    $scheduled = \Carbon\Carbon::createFromFormat('Y-m-d H:i', $date . ' ' . substr($time, 0, 5), config('app.timezone'));
                } catch (\Throwable $e) {
                    try {
                        $scheduled = \Carbon\Carbon::createFromFormat('Y-m-d H:i:s', $date . ' ' . $time, config('app.timezone'));
                    } catch (\Throwable $inner) {
                        continue;
                    }
                }

                if ($now->greaterThanOrEqualTo($scheduled->copy()->addMinute())) {
                    $filtered[] = [
                        'lead' => $lead,
                        'scheduled_at' => $scheduled->getTimestamp(),
                        'created_at' => optional($lead->created_at)->getTimestamp() ?? 0,
                        'lead_id' => (int) ($lead->id ?? 0),
                    ];
                }
            }

            usort($filtered, function ($a, $b) {
                if (($b['scheduled_at'] ?? 0) !== ($a['scheduled_at'] ?? 0)) {
                    return ($b['scheduled_at'] ?? 0) <=> ($a['scheduled_at'] ?? 0);
                }

                if (($b['created_at'] ?? 0) !== ($a['created_at'] ?? 0)) {
                    return ($b['created_at'] ?? 0) <=> ($a['created_at'] ?? 0);
                }

                return ($b['lead_id'] ?? 0) <=> ($a['lead_id'] ?? 0);
            });

            $orderedLeads = collect(array_map(fn ($item) => $item['lead'], $filtered))
                ->values();

            $total = $orderedLeads->count();
            $slice = $orderedLeads
                ->slice(($page - 1) * $perPage, $perPage)
                ->values()
                ->map(fn (Lead $lead) => $this->leadViewService->decorateLead($lead, $user, 'all'));

            $paginator = new LengthAwarePaginator(
                $slice,
                $total,
                $perPage,
                $page,
                ['path' => $request->url(), 'query' => $request->query()]
            );

            return TelesalesLeadResource::collection($paginator);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Telesales Delayed Leads Error: ' . $e->getMessage(), [
                'tenant_id' => $request->user()?->tenant_id,
                'user_id' => $request->user()?->id,
            ]);

            return response()->json([
                'message' => 'Failed to fetch telesales delayed leads',
                'error' => $e->getMessage(),
                'data' => [],
            ], 500);
        }
    }

    public function export(Request $request)
    {
        $user = $request->user();
        $tenant = $this->telesalesService->getTenantForUser($user);

        if ($this->telesalesService->isEnabledForTenant($tenant)) {
            $this->telesalesService->ensureOperationalAccess($user, 'export');
        } else {
            $this->telesalesService->ensureHistoricalAccess($user);
        }

        if (!$this->hasLeadWorkflowColumns()) {
            return response()->json([
                'message' => 'Telesales workflow columns are not available yet. Please run the latest CRM migrations first.',
            ], 409);
        }

        $leads = $this->buildOperationalLeadsQuery($request, true)->get();
        $leadIds = $leads->pluck('id')->map(fn ($id) => (int) $id)->values();

        $actions = LeadAction::query()
            ->with(['user:id,name', 'stageAtCreation:id,name'])
            ->whereIn('lead_id', $leadIds)
            ->orderBy('lead_id')
            ->orderBy('created_at')
            ->get();

        $workflowHistory = LeadWorkflowHistory::query()
            ->with(['performedByUser:id,name'])
            ->whereIn('lead_id', $leadIds)
            ->orderBy('lead_id')
            ->orderBy('created_at')
            ->get();

        $spreadsheet = new Spreadsheet();

        $leadSheet = $spreadsheet->getActiveSheet();
        $leadSheet->setTitle('Leads');
        $leadHeaders = [
            'Lead ID',
            'Lead Name',
            'Phone',
            'Phone Country',
            'Other Mobile',
            'Email',
            'Company',
            'Source',
            'Campaign',
            'Priority',
            'Stage',
            'Workflow',
            'Status',
            'Assigned To',
            'Manager',
            'Created By',
            'Estimated Value',
            'Country',
            'Created At',
            'Assigned At',
            'Last Action At',
            'Transferred To Sales At',
            'Notes',
        ];
        $leadSheet->fromArray($leadHeaders, null, 'A1');

        $leadRow = 2;
        foreach ($leads as $lead) {
            $leadMeta = is_array($lead->meta_data ?? null) ? $lead->meta_data : [];
            $leadSheet->fromArray([
                $lead->id,
                $lead->name,
                $lead->phone,
                $lead->phone_country
                    ?: ($leadMeta['phone_country'] ?? '')
                    ?: ($leadMeta['phoneCountry'] ?? ''),
                $lead->other_mobile
                    ?: ($leadMeta['other_mobile'] ?? '')
                    ?: ($leadMeta['otherMobile'] ?? ''),
                $lead->email,
                $lead->company,
                $lead->source,
                $lead->campaign ?: ($lead->campaignRelation?->name ?? ''),
                $lead->priority,
                $lead->stageRelation?->name ?: $lead->stage,
                $lead->workflow_key,
                $lead->status,
                $lead->assignedAgent?->name,
                $lead->manager?->name,
                $lead->creator?->name,
                $lead->estimated_value,
                $lead->country,
                optional($lead->created_at)->format('Y-m-d H:i:s'),
                optional($lead->assigned_at)->format('Y-m-d H:i:s'),
                optional($lead->last_action_at)->format('Y-m-d H:i:s'),
                optional($lead->transferred_to_sales_at)->format('Y-m-d H:i:s'),
                $lead->notes,
            ], null, 'A' . $leadRow);
            $leadRow++;
        }

        $historySheet = $spreadsheet->createSheet();
        $historySheet->setTitle('History & Activities');
        $historyHeaders = [
            'Lead ID',
            'Lead Name',
            'Record Type',
            'Action / Event',
            'Description',
            'Stage',
            'Performed By',
            'From Workflow',
            'To Workflow',
            'From Stage ID',
            'To Stage ID',
            'Meta Data',
            'Created At',
        ];
        $historySheet->fromArray($historyHeaders, null, 'A1');

        $historyRows = [];
        foreach ($actions as $action) {
            $historyRows[] = [
                $action->lead_id,
                $leads->firstWhere('id', $action->lead_id)?->name,
                'Lead Activity',
                $action->action_type,
                $action->description ?: json_encode($action->details, JSON_UNESCAPED_UNICODE),
                $action->stageAtCreation?->name,
                $action->user?->name,
                '',
                '',
                '',
                '',
                !empty($action->details) ? json_encode($action->details, JSON_UNESCAPED_UNICODE) : '',
                optional($action->created_at)->format('Y-m-d H:i:s'),
            ];
        }

        foreach ($workflowHistory as $history) {
            $historyRows[] = [
                $history->lead_id,
                $leads->firstWhere('id', $history->lead_id)?->name,
                'Workflow History',
                $history->action,
                '',
                '',
                $history->performedByUser?->name,
                $history->from_workflow,
                $history->to_workflow,
                $history->from_stage_id,
                $history->to_stage_id,
                !empty($history->meta_data) ? json_encode($history->meta_data, JSON_UNESCAPED_UNICODE) : '',
                optional($history->created_at)->format('Y-m-d H:i:s'),
            ];
        }

        usort($historyRows, static function (array $a, array $b) {
            return strcmp((string) ($a[12] ?? ''), (string) ($b[12] ?? ''));
        });

        if (!empty($historyRows)) {
            $historySheet->fromArray($historyRows, null, 'A2');
        }

        foreach ($spreadsheet->getAllSheets() as $sheet) {
            foreach (range('A', $sheet->getHighestColumn()) as $column) {
                $sheet->getColumnDimension($column)->setAutoSize(true);
            }
        }

        $selectedLeadIds = array_map('intval', $this->requestArray($request, 'lead_ids'));
        $selectedLeadIds = array_values(array_filter($selectedLeadIds, static fn ($id) => $id > 0));
        $scopeLabel = !empty($selectedLeadIds) ? 'selected' : 'all';
        $fileName = sprintf('telesales_leads_%s_%s.xlsx', $scopeLabel, now()->format('Ymd_His'));

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $fileName, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }
}
