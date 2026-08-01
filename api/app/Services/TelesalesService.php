<?php

namespace App\Services;

use App\Models\CrmSetting;
use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\LeadWorkflowHistory;
use App\Models\Stage;
use App\Models\Tenant;
use App\Models\User;
use App\Notifications\LeadAssigned;
use App\Support\PhoneNormalizer;
use App\Traits\ResolvesNotificationRecipients;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class TelesalesService
{
    use ResolvesNotificationRecipients;

    public const MODULE_SLUG = 'telesales';
    public const WORKFLOW_SALES = 'sales';
    public const WORKFLOW_TELESALES = 'telesales';
    private const OPEN_FOLLOW_UP_STATUSES = ['scheduled', 'Scheduled', 'pending', 'in_progress', 'in-progress', 'in progress'];

    public function getTenantForUser(?User $user): ?Tenant
    {
        if (!$user) {
            return null;
        }

        if (app()->bound('tenant')) {
            return app('tenant');
        }

        return Tenant::find($user->tenant_id);
    }

    public function isEnabledForTenant(?Tenant $tenant): bool
    {
        if (!$tenant) {
            return false;
        }

        try {
            return $tenant->modules()
                ->where('slug', self::MODULE_SLUG)
                ->wherePivot('is_enabled', true)
                ->exists();
        } catch (\Throwable $e) {
            return false;
        }
    }

    public function getPermissionList(?User $user): array
    {
        return $this->getModulePermissionList($user, 'Telesales');
    }

    public function getModulePermissionList(?User $user, string $moduleKey): array
    {
        $meta = is_array($user?->meta_data ?? null) ? ($user->meta_data ?? []) : [];
        $modulePermissions = is_array($meta['module_permissions'] ?? null) ? ($meta['module_permissions'] ?? []) : [];
        $permissions = $modulePermissions[$moduleKey] ?? [];

        return is_array($permissions) ? array_values(array_unique($permissions)) : [];
    }

    public function isPrivileged(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if ($user->is_super_admin ?? false) {
            return true;
        }

        $role = strtolower(trim((string) ($user->role ?? $user->job_title ?? '')));
        return in_array($role, ['admin', 'tenant admin', 'tenant-admin'], true);
    }

    public function userHasPermission(?User $user, string $permission): bool
    {
        if ($this->isPrivileged($user)) {
            return true;
        }

        if ($permission === 'createLead' || $permission === 'addLead') {
            return in_array('addLead', $this->getPermissionList($user), true)
                || in_array('createLead', $this->getPermissionList($user), true);
        }

        return in_array($permission, $this->getPermissionList($user), true);
    }

    public function userHasExplicitModulePermission(?User $user, string $moduleKey, string $permission): bool
    {
        return in_array($permission, $this->getModulePermissionList($user, $moduleKey), true);
    }

    public function isActiveUser(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        $status = strtolower(trim((string) ($user->status ?? 'active')));
        return $status === '' || $status === 'active';
    }

    public function normalizedRole(?User $user): string
    {
        $role = strtolower(trim((string) ($user?->role ?? $user?->job_title ?? '')));
        $role = str_replace(['_', '-'], ' ', $role);
        return preg_replace('/\s+/', ' ', $role) ?: '';
    }

    public function isTelesalesOnlyRole(?User $user): bool
    {
        return in_array($this->normalizedRole($user), [
            'telesales agent',
            'telesales team leader',
            'telesales manager',
        ], true);
    }

    public function isSalesWorkflowRole(?User $user): bool
    {
        $role = $this->normalizedRole($user);
        if ($role === '') {
            return false;
        }

        if ($this->isTelesalesOnlyRole($user)) {
            return false;
        }

        if (in_array($role, [
            'admin',
            'tenant admin',
            'tenant admin',
            'super admin',
            'owner',
            'director',
            'sales director',
            'operation manager',
            'operations manager',
            'sales admin',
            'sales manager',
            'branch manager',
            'manager',
            'sales person',
            'salesperson',
            'broker',
        ], true)) {
            return true;
        }

        return str_contains($role, 'sales ') && !str_contains($role, 'telesales');
    }

    public function isEligibleTelesalesAssignee(?User $user, int $tenantId): bool
    {
        if (!$user || (int) ($user->tenant_id ?? 0) !== $tenantId || !$this->isActiveUser($user)) {
            return false;
        }

        if ($this->isPrivileged($user)) {
            return true;
        }

        return $this->userHasExplicitModulePermission($user, 'Telesales', 'showModule')
            && $this->userHasExplicitModulePermission($user, 'Telesales', 'receiveLeads');
    }

    public function isEligibleConvertedTelesalesSalesAssignee(?User $user, int $tenantId): bool
    {
        if (!$user || (int) ($user->tenant_id ?? 0) !== $tenantId || !$this->isActiveUser($user)) {
            return false;
        }

        if ($this->isTelesalesOnlyRole($user)) {
            return false;
        }

        if ($this->isPrivileged($user)) {
            return true;
        }

        return $this->userHasExplicitModulePermission($user, 'Leads', 'receiveLeads');
    }

    public function getEligibleTelesalesAssignees(int $tenantId): Collection
    {
        return User::query()
            ->where('tenant_id', $tenantId)
            ->get()
            ->filter(fn (User $user) => $this->isEligibleTelesalesAssignee($user, $tenantId))
            ->values();
    }

    public function getEligibleConvertedTelesalesSalesAssignees(int $tenantId): Collection
    {
        return User::query()
            ->where('tenant_id', $tenantId)
            ->get()
            ->filter(fn (User $user) => $this->isEligibleConvertedTelesalesSalesAssignee($user, $tenantId))
            ->values();
    }

    public function validateTelesalesAssigneeId(int $tenantId, ?int $assigneeId): ?User
    {
        if (!$assigneeId) {
            return null;
        }

        $user = User::query()->where('tenant_id', $tenantId)->find($assigneeId);
        if (!$this->isEligibleTelesalesAssignee($user, $tenantId)) {
            throw new \InvalidArgumentException('Selected telesales assignee is not eligible to receive telesales leads.');
        }

        return $user;
    }

    public function validateSalesAssigneeId(int $tenantId, ?int $assigneeId): ?User
    {
        if (!$assigneeId) {
            return null;
        }

        $user = User::query()->where('tenant_id', $tenantId)->find($assigneeId);
        if (!$this->isEligibleConvertedTelesalesSalesAssignee($user, $tenantId)) {
            throw new \InvalidArgumentException('Selected sales assignee is not eligible to receive converted telesales leads.');
        }

        return $user;
    }

    public function ensureOperationalAccess(?User $user, string $permission): void
    {
        $tenant = $this->getTenantForUser($user);
        if (!$this->isEnabledForTenant($tenant)) {
            throw new AuthorizationException('Telesales module is disabled for this tenant.');
        }

        if (!$this->userHasPermission($user, $permission)) {
            throw new AuthorizationException('You do not have telesales permission for this action.');
        }
    }

    public function ensureHistoricalAccess(?User $user): void
    {
        if (!$this->userHasPermission($user, 'viewHistoricalRecords')) {
            throw new AuthorizationException('You do not have permission to view telesales historical records.');
        }
    }

    public function getCrmSettings(?int $tenantId): array
    {
        if (!$tenantId) {
            return [];
        }

        $settings = CrmSetting::query()->where('tenant_id', $tenantId)->first();
        return is_array($settings?->settings ?? null) ? ($settings->settings ?? []) : [];
    }

    public function normalizeSource(?string $source): string
    {
        $value = strtolower(trim((string) $source));
        $value = str_replace(['_', '-'], ' ', $value);
        return preg_replace('/\s+/', ' ', $value) ?: '';
    }

    public function normalizeValue(?string $value): string
    {
        $normalized = strtolower(trim((string) $value));
        $normalized = str_replace(['_', '-'], ' ', $normalized);
        return preg_replace('/\s+/', ' ', $normalized) ?: '';
    }

    private function applyDuplicateWorkflowScope($query, ?int $tenantId, ?string $workflowKey): void
    {
        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $normalizedWorkflow = strtolower(trim((string) ($workflowKey ?? '')));
        if ($normalizedWorkflow === '' || !Schema::hasColumn('leads', 'workflow_key')) {
            return;
        }

        $query->where('workflow_key', $normalizedWorkflow);

        if ($normalizedWorkflow === self::WORKFLOW_TELESALES
            && Schema::hasColumn('leads', 'transferred_to_sales_at')) {
            $query->whereNull('transferred_to_sales_at');
        }
    }

    private function resolveDuplicateRootId(?Lead $lead, ?int $tenantId = null): ?int
    {
        if (!$lead) {
            return null;
        }

        $seen = [];
        $current = $lead;

        for ($i = 0; $i < 10; $i++) {
            $id = (int) ($current->id ?? 0);
            if ($id <= 0) {
                return null;
            }

            if (isset($seen[$id])) {
                return $id;
            }
            $seen[$id] = true;

            $meta = is_array($current->meta_data ?? null) ? ($current->meta_data ?? []) : [];
            $dupOf = $meta['duplicate_of'] ?? null;
            if (!is_numeric($dupOf) || (int) $dupOf <= 0) {
                return $id;
            }

            $nextQuery = Lead::query()->where('id', (int) $dupOf);
            if ($tenantId) {
                $nextQuery->where('tenant_id', $tenantId);
            }

            $next = $nextQuery->first();
            if (!$next) {
                return $id;
            }

            $current = $next;
        }

        return (int) ($current->id ?? null);
    }

    private function resolveSalesDuplicateMatch(Lead $lead, int $tenantId): ?Lead
    {
        $rawPhone = trim((string) ($lead->phone ?? ''));
        if ($rawPhone === '') {
            return null;
        }

        $meta = is_array($lead->meta_data ?? null) ? ($lead->meta_data ?? []) : [];
        $phoneCountry = trim((string) ($meta['phone_country'] ?? ''));
        $variants = PhoneNormalizer::variantsForSearch($rawPhone, $phoneCountry !== '' ? $phoneCountry : null);
        $variants = !empty($variants) ? $variants : [$rawPhone];

        $base = Lead::query()->where('id', '!=', $lead->id);
        $this->applyDuplicateWorkflowScope($base, $tenantId, self::WORKFLOW_SALES);

        $match = (clone $base)
            ->whereIn('phone', $variants)
            ->where(function ($q) {
                $q->whereNull('is_duplicate_exception')->orWhere('is_duplicate_exception', false);
            })
            ->orderBy('id', 'asc')
            ->first();

        return $match instanceof Lead ? $match : null;
    }

    public function resolveInitialWorkflow(?User $actor, array $payload): string
    {
        $tenantId = (int) ($actor?->tenant_id ?? 0);
        $requestedWorkflow = strtolower(trim((string) ($payload['workflow_key'] ?? '')));
        $tenant = $this->getTenantForUser($actor);

        if (in_array($requestedWorkflow, [self::WORKFLOW_SALES, self::WORKFLOW_TELESALES], true)) {
            if ($requestedWorkflow === self::WORKFLOW_TELESALES) {
                if ($this->isEnabledForTenant($tenant) && $this->userHasPermission($actor, 'addLead')) {
                    return self::WORKFLOW_TELESALES;
                }

                return self::WORKFLOW_SALES;
            }

            return self::WORKFLOW_SALES;
        }

        $settings = $this->getCrmSettings($tenantId);
        $mappings = $settings['leadWorkflowSourceMappings'] ?? [];
        $defaultWorkflow = strtolower(trim((string) ($settings['defaultWorkflowFallback'] ?? self::WORKFLOW_SALES)));
        $source = $this->normalizeSource($payload['source'] ?? null);

        if ($source !== '' && is_array($mappings)) {
            foreach ($mappings as $mapping) {
                $mappingSource = $this->normalizeSource($mapping['source'] ?? null);
                $mappingWorkflow = strtolower(trim((string) ($mapping['workflow_key'] ?? '')));
                if ($mappingSource !== '' && $mappingSource === $source && in_array($mappingWorkflow, [self::WORKFLOW_SALES, self::WORKFLOW_TELESALES], true)) {
                    if ($mappingWorkflow === self::WORKFLOW_TELESALES) {
                        return $this->isEnabledForTenant($tenant) ? self::WORKFLOW_TELESALES : self::WORKFLOW_SALES;
                    }
                    return self::WORKFLOW_SALES;
                }
            }
        }

        if ($defaultWorkflow === self::WORKFLOW_TELESALES && $this->isEnabledForTenant($tenant)) {
            return self::WORKFLOW_TELESALES;
        }

        return self::WORKFLOW_SALES;
    }

    public function getStagesForWorkflow(?int $tenantId, string $workflowKey, bool $activeOnly = false): Collection
    {
        if (!Schema::hasColumn('stages', 'workflow_key')) {
            return collect();
        }

        $query = Stage::query()
            ->where('workflow_key', $workflowKey)
            ->orderBy('order')
            ->orderBy('id');

        if ($tenantId) {
            $query->where(function ($q) use ($tenantId) {
                $q->whereNull('tenant_id')->orWhere('tenant_id', $tenantId);
            });
        }

        if ($activeOnly) {
            $query->where('is_active', true);
        }

        return $query->get();
    }

    public function resolveEntryStageId(?int $tenantId, string $workflowKey, ?int $preferredStageId = null): ?int
    {
        if ($preferredStageId) {
            $stage = Stage::query()
                ->where('id', $preferredStageId)
                ->where('workflow_key', $workflowKey)
                ->first();
            if ($stage) {
                return (int) $stage->id;
            }
        }

        $stage = $this->getStagesForWorkflow($tenantId, $workflowKey, true)->first();
        return $stage ? (int) $stage->id : null;
    }

    public function resolveSalesAssignmentStageId(?int $tenantId, string $targetStage, ?int $fallbackStageId = null): ?int
    {
        if ($targetStage === 'same_stage') {
            return $fallbackStageId ? (int) $fallbackStageId : null;
        }

        $salesStages = $this->getStagesForWorkflow($tenantId, self::WORKFLOW_SALES, true);
        if ($salesStages->isEmpty()) {
            return $fallbackStageId ? (int) $fallbackStageId : null;
        }

        $targetTokens = $targetStage === 'cold_calls'
            ? ['cold calls', 'cold call', 'cold_calls', 'cold_call', 'coldcalls']
            : ['new lead', 'new', 'fresh'];

        $matchedStage = $salesStages->first(function (Stage $stage) use ($targetTokens) {
            $name = $this->normalizeValue((string) ($stage->name ?? ''));
            $type = $this->normalizeValue((string) ($stage->type ?? ''));

            return in_array($name, $targetTokens, true) || in_array($type, $targetTokens, true);
        });

        if ($matchedStage) {
            return (int) $matchedStage->id;
        }

        if (in_array($targetStage, ['new_lead', 'cold_calls'], true)) {
            return null;
        }

        return $fallbackStageId ? (int) $fallbackStageId : null;
    }

    public function syncLeadStageFields(Lead $lead): void
    {
        $stageId = $lead->stage_id ? (int) $lead->stage_id : null;
        if (!$stageId) {
            return;
        }

        $stage = Stage::query()->find($stageId);
        if (!$stage) {
            return;
        }

        $lead->stage = trim((string) $stage->name);
        if (empty($lead->workflow_key)) {
            $lead->workflow_key = $stage->workflow_key ?: self::WORKFLOW_SALES;
        }
    }

    public function appendWorkflowHistory(Lead $lead, ?User $actor, array $payload): void
    {
        LeadWorkflowHistory::create([
            'tenant_id' => $lead->tenant_id,
            'lead_id' => $lead->id,
            'from_workflow' => $payload['from_workflow'] ?? null,
            'to_workflow' => $payload['to_workflow'] ?? null,
            'from_stage_id' => $payload['from_stage_id'] ?? null,
            'to_stage_id' => $payload['to_stage_id'] ?? null,
            'action' => (string) ($payload['action'] ?? 'workflow_updated'),
            'performed_by' => $actor?->id,
            'meta_data' => $payload['meta_data'] ?? null,
        ]);
    }

    public function shouldResetFollowUpOnStage(?string $targetStage): bool
    {
        return in_array($this->normalizeValue($targetStage), ['new lead', 'cold calls'], true);
    }

    public function resetLeadFollowUpOnReassignment(Lead $lead, ?User $actor, ?string $targetStage): int
    {
        if (!$this->shouldResetFollowUpOnStage($targetStage)) {
            return 0;
        }

        $normalizedTargetStage = $this->normalizeValue($targetStage);
        $targetStageLabel = $normalizedTargetStage === 'cold calls' ? 'Cold Calls' : 'New Lead';
        $actorName = trim((string) ($actor?->name ?? 'System'));
        $updatedCount = 0;

        LeadAction::query()
            ->where('lead_id', $lead->id)
            ->whereIn('details->status', self::OPEN_FOLLOW_UP_STATUSES)
            ->get()
            ->each(function (LeadAction $action) use ($targetStageLabel, $normalizedTargetStage, $actorName, $actor, &$updatedCount) {
                $details = is_array($action->details ?? null)
                    ? ($action->details ?? [])
                    : (json_decode($action->details, true) ?? []);

                $previousStatus = trim((string) ($details['status'] ?? ''));
                $details['status'] = 'superseded';
                $details['action_state'] = 'superseded';
                $details['superseded_by_reassignment'] = true;
                $details['superseded_previous_status'] = $previousStatus !== '' ? $previousStatus : null;
                $details['superseded_reason'] = 'Lead reassigned as ' . $targetStageLabel . ' with no next action date.';
                $details['superseded_at'] = now()->toDateTimeString();
                $details['superseded_by_user_id'] = $actor?->id;
                $details['superseded_by_user_name'] = $actorName;
                $details['reassignment_stage'] = $normalizedTargetStage === 'cold calls' ? 'cold_calls' : 'new_lead';

                $action->details = $details;
                $action->saveQuietly();
                $updatedCount++;
            });

        return $updatedCount;
    }

    public function transferLeadToSales(Lead $lead, User $actor, array $payload): Lead
    {
        $this->ensureOperationalAccess($actor, 'transferToSales');

        $tenantId = (int) ($actor->tenant_id ?? $lead->tenant_id ?? 0);
        $settings = $this->getCrmSettings($tenantId);
        $targetStage = (string) ($payload['stage'] ?? '');
        $historyOption = (string) ($payload['history_option'] ?? 'keep_history');
        $preferredStageId = (int) ($payload['sales_entry_stage_id'] ?? ($settings['salesEntryStageIdForTransferredLeads'] ?? 0));
        $salesStageId = $targetStage !== ''
            ? $this->resolveSalesAssignmentStageId($tenantId, $targetStage, $lead->stage_id ? (int) $lead->stage_id : null)
            : $this->resolveEntryStageId($tenantId, self::WORKFLOW_SALES, $preferredStageId);

        if (!$salesStageId) {
            throw new \InvalidArgumentException('No sales entry stage is configured.');
        }

        $assignmentMethod = strtolower(trim((string) ($payload['assignment_method'] ?? 'direct')));
        $directAssignee = !empty($payload['assigned_to']) ? (int) $payload['assigned_to'] : null;

        return DB::transaction(function () use ($lead, $actor, $tenantId, $salesStageId, $assignmentMethod, $directAssignee, $historyOption, $targetStage) {
            $previousWorkflow = $lead->workflow_key ?: self::WORKFLOW_SALES;
            $previousStageId = $lead->stage_id;
            $duplicateMatch = $this->resolveSalesDuplicateMatch($lead, $tenantId);
            $previousAssignedToId = $lead->assigned_to ? (int) $lead->assigned_to : null;
            $previousAssignedToName = $lead->assignedAgent?->name ?: (!empty($lead->sales_person) ? (string) $lead->sales_person : null);

            $lead->workflow_key = self::WORKFLOW_SALES;
            $lead->stage_id = $salesStageId;
            $lead->workflow_entered_at = now();
            $lead->transferred_to_sales_at = now();
            $lead->created_by = $actor->id;
            $lead->qualified_by = $actor->id;

            if ($assignmentMethod === 'rotation') {
                $engine = app(LeadRotationEngine::class);
                $filters = $engine->resolveLeadFilters($lead, $tenantId);
                $queueKey = $engine->buildQueueKey($lead, $filters);
                $salesEligibleIds = $this->getEligibleConvertedTelesalesSalesAssignees($tenantId)
                    ->pluck('id')
                    ->map(fn ($id) => (int) $id)
                    ->values()
                    ->all();
                $eligible = array_values(array_intersect(
                    $engine->getEligibleAssignUserIds($tenantId, $filters),
                    $salesEligibleIds
                ));
                $next = $engine->pickNextUserId($tenantId, $queueKey, $eligible);
                if ($next) {
                    $engine->assignLeadToUser($lead, $next);
                } else {
                    $lead->assigned_to = null;
                    $lead->sales_person = null;
                }
            } elseif ($directAssignee) {
                $assignee = $this->validateSalesAssigneeId($tenantId, $directAssignee);
                $lead->assigned_to = $assignee->id;
                $lead->sales_person = $assignee->name;
            } else {
                // Do not keep the telesales owner as the sales assignee when
                // conversion happens without selecting a target sales user.
                $lead->assigned_to = null;
                $lead->sales_person = null;
            }

            $this->syncLeadStageFields($lead);
            $lead->unsetRelation('assignedAgent');
            $lead->loadMissing('assignedAgent:id,name');

            $meta = is_array($lead->meta_data ?? null) ? ($lead->meta_data ?? []) : [];
            if ($duplicateMatch) {
                $lead->status = 'duplicate';
                $lead->stage = 'Duplicate';
                $meta['duplicate_of'] = $this->resolveDuplicateRootId($duplicateMatch, $tenantId) ?: (int) $duplicateMatch->id;
                $meta['converted_duplicate_in_sales'] = true;
                $meta['converted_duplicate_checked_at'] = now()->toDateTimeString();
            } else {
                if (strtolower(trim((string) ($lead->status ?? ''))) === 'duplicate') {
                    $lead->status = 'new';
                }
                if (($meta['duplicate_of'] ?? null) && is_numeric($meta['duplicate_of'])) {
                    unset($meta['duplicate_of']);
                }
                unset($meta['converted_duplicate_in_sales'], $meta['converted_duplicate_checked_at']);
            }
            $lead->meta_data = !empty($meta) ? $meta : null;

            if ($historyOption === 'assign_as_new') {
                $lastActionId = DB::table('lead_actions')->where('lead_id', $lead->id)->max('id');
                $lead->history_hidden_before_action_id = $lastActionId ?: null;
                $lead->sales_view_reset_at = now();
            } else {
                $lead->history_hidden_before_action_id = null;
                $lead->sales_view_reset_at = null;
            }

            $this->resetLeadFollowUpOnReassignment($lead, $actor, $targetStage);
            $lead->save();

            $this->appendWorkflowHistory($lead, $actor, [
                'from_workflow' => $previousWorkflow,
                'to_workflow' => self::WORKFLOW_SALES,
                'from_stage_id' => $previousStageId,
                'to_stage_id' => $salesStageId,
                'action' => 'transfer_to_sales',
                'meta_data' => [
                    'assignment_method' => $assignmentMethod,
                    'assign_role' => !empty($payload['assign_role']) ? (string) $payload['assign_role'] : 'sales',
                    'from_assigned_to' => $previousAssignedToId,
                    'from_assigned_to_name' => $previousAssignedToName,
                    'assigned_to' => $lead->assigned_to,
                    'assigned_to_name' => $lead->assignedAgent?->name ?: $lead->sales_person,
                    'stage' => $targetStage !== '' ? $targetStage : null,
                    'history_option' => $historyOption,
                    'is_duplicate_in_sales' => (bool) $duplicateMatch,
                    'duplicate_of' => $duplicateMatch ? ($meta['duplicate_of'] ?? null) : null,
                ],
            ]);

            $freshLead = $lead->fresh(['assignedAgent:id,name', 'creator:id,name']);

            if ($freshLead?->assigned_to && $actor) {
                $assigneeRecipient = User::with(['manager', 'team.leader'])->find($freshLead->assigned_to);
                if ($assigneeRecipient) {
                    $notification = new LeadAssigned($freshLead, $actor->name);
                    $recipients = $this->buildNotificationRecipients(
                        $assigneeRecipient,
                        [
                            'owner' => $freshLead->creator,
                            'assignee' => $assigneeRecipient,
                            'assigner' => $actor,
                        ],
                        'leads',
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

            return $freshLead;
        });
    }

    public function getActiveTelesalesLeadsQuery(?int $tenantId)
    {
        $query = Lead::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->whereNull('deleted_at');

        if (Schema::hasColumn('leads', 'workflow_key')) {
            $query->where('workflow_key', self::WORKFLOW_TELESALES);
        } else {
            $query->whereRaw('1 = 0');
        }

        return $query;
    }
}
