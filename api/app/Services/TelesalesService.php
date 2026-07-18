<?php

namespace App\Services;

use App\Models\CrmSetting;
use App\Models\Lead;
use App\Models\LeadWorkflowHistory;
use App\Models\Stage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class TelesalesService
{
    public const MODULE_SLUG = 'telesales';
    public const WORKFLOW_SALES = 'sales';
    public const WORKFLOW_TELESALES = 'telesales';

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

    public function isEligibleSalesAssignee(?User $user, int $tenantId): bool
    {
        if (!$user || (int) ($user->tenant_id ?? 0) !== $tenantId || !$this->isActiveUser($user)) {
            return false;
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

    public function getEligibleSalesAssignees(int $tenantId): Collection
    {
        return User::query()
            ->where('tenant_id', $tenantId)
            ->get()
            ->filter(fn (User $user) => $this->isEligibleSalesAssignee($user, $tenantId))
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
        if (!$this->isEligibleSalesAssignee($user, $tenantId)) {
            throw new \InvalidArgumentException('Selected sales assignee is not eligible to receive sales leads.');
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

    public function resolveInitialWorkflow(?User $actor, array $payload): string
    {
        $tenantId = (int) ($actor?->tenant_id ?? 0);
        $requestedWorkflow = strtolower(trim((string) ($payload['workflow_key'] ?? '')));

        if ($requestedWorkflow === self::WORKFLOW_TELESALES) {
            $tenant = $this->getTenantForUser($actor);
            if ($this->isEnabledForTenant($tenant) && $this->userHasPermission($actor, 'createLead')) {
                return self::WORKFLOW_TELESALES;
            }
        }

        $settings = $this->getCrmSettings($tenantId);
        $mappings = $settings['leadWorkflowSourceMappings'] ?? [];
        $source = $this->normalizeSource($payload['source'] ?? null);

        if ($source !== '' && is_array($mappings)) {
            foreach ($mappings as $mapping) {
                $mappingSource = $this->normalizeSource($mapping['source'] ?? null);
                $mappingWorkflow = strtolower(trim((string) ($mapping['workflow_key'] ?? '')));
                if ($mappingSource !== '' && $mappingSource === $source && in_array($mappingWorkflow, [self::WORKFLOW_SALES, self::WORKFLOW_TELESALES], true)) {
                    if ($mappingWorkflow === self::WORKFLOW_TELESALES) {
                        $tenant = $this->getTenantForUser($actor);
                        return $this->isEnabledForTenant($tenant) ? self::WORKFLOW_TELESALES : self::WORKFLOW_SALES;
                    }
                    return self::WORKFLOW_SALES;
                }
            }
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

    public function transferLeadToSales(Lead $lead, User $actor, array $payload): Lead
    {
        $this->ensureOperationalAccess($actor, 'transferToSales');

        $tenantId = (int) ($actor->tenant_id ?? $lead->tenant_id ?? 0);
        $settings = $this->getCrmSettings($tenantId);
        $preferredStageId = (int) ($payload['sales_entry_stage_id'] ?? ($settings['salesEntryStageIdForTransferredLeads'] ?? 0));
        $salesStageId = $this->resolveEntryStageId($tenantId, self::WORKFLOW_SALES, $preferredStageId);

        if (!$salesStageId) {
            throw new \InvalidArgumentException('No sales entry stage is configured.');
        }

        $assignmentMethod = strtolower(trim((string) ($payload['assignment_method'] ?? 'direct')));
        $directAssignee = !empty($payload['assigned_to']) ? (int) $payload['assigned_to'] : null;

        return DB::transaction(function () use ($lead, $actor, $tenantId, $salesStageId, $assignmentMethod, $directAssignee) {
            $previousWorkflow = $lead->workflow_key ?: self::WORKFLOW_SALES;
            $previousStageId = $lead->stage_id;

            $lead->workflow_key = self::WORKFLOW_SALES;
            $lead->stage_id = $salesStageId;
            $lead->workflow_entered_at = now();
            $lead->transferred_to_sales_at = now();
            $lead->qualified_by = $actor->id;

            if ($assignmentMethod === 'rotation') {
                $engine = app(LeadRotationEngine::class);
                $filters = $engine->resolveLeadFilters($lead, $tenantId);
                $queueKey = $engine->buildQueueKey($lead, $filters);
                $salesEligibleIds = $this->getEligibleSalesAssignees($tenantId)
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
            }

            $this->syncLeadStageFields($lead);
            $lead->save();

            $this->appendWorkflowHistory($lead, $actor, [
                'from_workflow' => $previousWorkflow,
                'to_workflow' => self::WORKFLOW_SALES,
                'from_stage_id' => $previousStageId,
                'to_stage_id' => $salesStageId,
                'action' => 'transfer_to_sales',
                'meta_data' => [
                    'assignment_method' => $assignmentMethod,
                    'assigned_to' => $lead->assigned_to,
                ],
            ]);

            return $lead->fresh(['assignedAgent:id,name', 'creator:id,name']);
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
