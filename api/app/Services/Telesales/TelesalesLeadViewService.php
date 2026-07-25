<?php

namespace App\Services\Telesales;

use App\Models\Lead;
use App\Models\Stage;
use App\Models\User;
use App\Services\TelesalesService;
use App\Traits\UserHierarchyTrait;
use Illuminate\Http\Request;

class TelesalesLeadViewService
{
    use UserHierarchyTrait;

    public function __construct(private readonly TelesalesService $telesalesService)
    {
    }

    public function normalizeValue(?string $value): string
    {
        $normalized = strtolower(trim((string) $value));
        $normalized = str_replace(['_', '-'], ' ', $normalized);

        return preg_replace('/\s+/u', ' ', $normalized) ?: '';
    }

    public function shouldForceAssignedScope(?User $user): bool
    {
        return $this->isTelesalesAgent($user);
    }

    public function canViewDuplicateDisplayStage(?User $user): bool
    {
        $tenantId = (int) ($user?->tenant_id ?? 0);
        $settings = $this->telesalesService->getCrmSettings($tenantId);
        if (!$this->isTruthySetting($settings['duplicationSystem'] ?? false)) {
            return false;
        }

        $permissions = $this->telesalesService->getPermissionList($user);

        return in_array('viewDuplicateLeads', $permissions, true);
    }

    public function canViewPendingDisplayStage(?User $user, string $scope = 'all'): bool
    {
        if ($scope === 'my') {
            return false;
        }

        return !$this->isTelesalesAgent($user);
    }

    public function decorateLead(Lead $lead, ?User $user = null, ?string $scope = null): Lead
    {
        if ($user && $scope !== null) {
            $lead->display_stage = $this->resolveDisplayStage($lead, $user, $scope);
            $lead->display_stage_key = $this->resolveDisplayStageKey($lead, $user, $scope);
        }

        $lead->assigned_to_name =
            $lead->assignedAgent?->name
            ?: (is_object($lead->assigned_to) ? ($lead->assigned_to->name ?? null) : null)
            ?: (!empty($lead->sales_person) ? (string) $lead->sales_person : null);
        $currentAssignedToId = !empty($lead->assigned_to) ? (int) $lead->assigned_to : null;
        $currentAssignedToName = $lead->assignedAgent?->name ?: (!empty($lead->sales_person) ? (string) $lead->sales_person : null);

        $transferHistory = $lead->latestTransferToSalesHistory;
        $transferMeta = is_array($transferHistory?->meta_data ?? null) ? ($transferHistory->meta_data ?? []) : [];
        $lead->convert_by_name =
            $transferHistory?->performedByUser?->name
            ?: $lead->latestAction?->user?->name
            ?: null;
        $lead->transfer_from_assignee_id = !empty($transferMeta['from_assigned_to']) ? (int) $transferMeta['from_assigned_to'] : null;
        $lead->transfer_from_assignee_name =
            (!empty($transferMeta['from_assigned_to_name']) ? (string) $transferMeta['from_assigned_to_name'] : null)
            ?: null;
        $metaTransferToAssigneeId = !empty($transferMeta['assigned_to']) ? (int) $transferMeta['assigned_to'] : null;
        $metaTransferToAssigneeName = !empty($transferMeta['assigned_to_name']) ? (string) $transferMeta['assigned_to_name'] : null;
        $lead->transfer_to_assignee_id = $metaTransferToAssigneeId ?: null;
        $lead->transfer_to_assignee_name = $metaTransferToAssigneeName ?: null;
        $lead->transfer_assign_role = !empty($transferMeta['assign_role']) ? (string) $transferMeta['assign_role'] : null;
        $lead->transfer_from_stage_name = $transferHistory?->fromStage?->name ?: null;
        $lead->transfer_to_stage_name = $transferHistory?->toStage?->name ?: null;

        if ($lead->transfer_to_assignee_id && $currentAssignedToId && $lead->transfer_to_assignee_id === $currentAssignedToId && !empty($currentAssignedToName)) {
            $lead->transfer_to_assignee_name = $currentAssignedToName;
        }

        $isLegacyTransferredLead = !empty($lead->transferred_to_sales_at)
            && !$lead->transfer_to_assignee_id
            && empty($lead->transfer_to_assignee_name);

        if ($isLegacyTransferredLead) {
            $lead->transfer_to_assignee_id = $currentAssignedToId;
            $lead->transfer_to_assignee_name = $currentAssignedToName;
        }

        $lead->convert_to_name =
            $lead->transfer_to_assignee_name
            ?: (
                $lead->transfer_to_assignee_id
                && (!$lead->transfer_from_assignee_id || $lead->transfer_to_assignee_id !== $lead->transfer_from_assignee_id)
                    ? ($lead->assignedAgent?->name ?: (!empty($lead->sales_person) ? (string) $lead->sales_person : null))
                    : null
            );
        $lead->transfer_history_id = $transferHistory?->id;
        $lead->transfer_stage = !empty($transferMeta['stage']) ? (string) $transferMeta['stage'] : null;
        $lead->transfer_history_option = !empty($transferMeta['history_option']) ? (string) $transferMeta['history_option'] : null;

        $existingPermissions = is_array($lead->permissions ?? null) ? ($lead->permissions ?? []) : [];
        $lead->permissions = array_merge($existingPermissions, [
            'can_add_action' => $user ? $this->canAddActionToLead($user, $lead) : false,
        ]);

        return $lead;
    }

    public function buildStageCardDefinitions(?User $viewer, string $scope = 'all'): array
    {
        $tenantId = (int) ($viewer?->tenant_id ?? 0);
        $stages = $this->telesalesService
            ->getStagesForWorkflow($tenantId, TelesalesService::WORKFLOW_TELESALES, true)
            ->sortBy([
                ['order', 'asc'],
                ['id', 'asc'],
            ])
            ->values();

        $cards = [];
        foreach ($stages as $stage) {
            $typeKey = $this->normalizeValue((string) ($stage->type ?? ''));
            $nameKey = $this->normalizeValue((string) ($stage->name ?? ''));
            $key = match (true) {
                $typeKey === 'convert' => 'convert',
                in_array($nameKey, ['duplicate', 'pending', 'fresh'], true) => $nameKey,
                in_array($typeKey, ['cold calls', 'cold call'], true) => 'cold calls',
                $nameKey !== '' => $nameKey,
                default => $typeKey,
            };
            if ($key === '') {
                continue;
            }

            if ($key === 'duplicate' && !$this->canViewDuplicateDisplayStage($viewer)) {
                continue;
            }

            if ($key === 'pending' && !$this->canViewPendingDisplayStage($viewer, $scope)) {
                continue;
            }

            $cards[] = [
                'id' => $stage->id,
                'stage_key' => str_replace(' ', '_', $key),
                'stage_name' => (string) ($stage->name ?? ''),
                'stage_name_ar' => (string) ($stage->name_ar ?? ''),
                'stage_type' => str_replace(' ', '_', $typeKey),
                'icon' => (string) ($stage->icon ?? 'BarChart2'),
                'color' => (string) ($stage->color ?? ''),
                'order' => (int) ($stage->order ?? 0),
                'is_convert' => $typeKey === 'convert',
                'excluded_from_total' => in_array($typeKey, ['convert', 'display'], true) || $nameKey === 'duplicate',
                'visible' => true,
            ];
        }

        return array_values($cards);
    }

    public function resolveDisplayStage(Lead $lead, ?User $viewer, string $scope = 'all'): string
    {
        $baseStage = trim((string) ($lead->stageRelation?->name ?? $lead->stage ?? ''));

        if ($this->isConvertLead($lead)) {
            return 'Transferred';
        }

        if ($this->isDuplicateLead($lead) && $this->canViewDuplicateDisplayStage($viewer)) {
            return 'Duplicate';
        }

        if ($this->isPendingDisplayLead($lead, $viewer, $scope)) {
            return 'Pending';
        }

        return $baseStage !== '' ? $baseStage : '-';
    }

    public function resolveDisplayStageKey(Lead $lead, ?User $viewer, string $scope = 'all'): string
    {
        if ($this->isConvertLead($lead)) {
            return 'convert';
        }

        if ($this->isDuplicateLead($lead) && $this->canViewDuplicateDisplayStage($viewer)) {
            return 'duplicate';
        }

        if ($this->isPendingDisplayLead($lead, $viewer, $scope)) {
            return 'pending';
        }

        if ($this->isFreshLead($lead)) {
            return 'fresh';
        }

        if ($this->isColdCallsLead($lead)) {
            return 'cold calls';
        }

        $baseName = $this->normalizeValue((string) ($lead->stageRelation?->name ?? $lead->stage ?? ''));
        if ($baseName !== '') {
            return $baseName;
        }

        $baseType = $this->normalizeValue((string) ($lead->stageRelation?->type ?? ''));
        if ($baseType !== '' && $baseType !== 'display') {
            return $baseType === 'cold calls' || $baseType === 'cold call' ? 'cold calls' : $baseType;
        }

        return $baseName;
    }

    public function applyDisplayStageFilter($query, Request $request): void
    {
        if (!$request->filled('display_stage')) {
            return;
        }

        $displayStage = $this->normalizeValue((string) $request->input('display_stage'));
        $viewer = $request->user();
        $scope = $this->normalizeValue((string) $request->input('scope', 'all'));
        $viewerId = (int) ($viewer?->id ?? 0);
        $viewerIsManagerOrHigher = $this->isHigherRole($viewer) || $this->isTelesalesManager($viewer) || $this->isTelesalesTeamLeader($viewer);
        $noActionAfterAssignmentSql = "(last_action_at IS NULL OR last_action_at <= COALESCE(assigned_at, updated_at, created_at))";

        if ($displayStage === 'duplicate') {
            if (!$this->canViewDuplicateDisplayStage($viewer)) {
                $query->whereRaw('1 = 0');

                return;
            }

            $query->where(function ($q) {
                $q->whereRaw("LOWER(COALESCE(stage, '')) = 'duplicate'")
                    ->orWhereRaw("LOWER(COALESCE(status, '')) = 'duplicate'")
                    ->orWhereNotNull('meta_data->duplicate_of')
                    ->orWhereNotNull('meta_data->duplicateOf');
            });

            return;
        }

        if ($displayStage === 'convert') {
            $query->whereNotNull('transferred_to_sales_at');

            return;
        }

        if ($displayStage === 'pending') {
            if (!$this->canViewPendingDisplayStage($viewer, $scope)) {
                $query->whereRaw('1 = 0');

                return;
            }

            $query->where(function ($q) use ($viewerId, $viewerIsManagerOrHigher, $noActionAfterAssignmentSql) {
                $q->where(function ($sub) use ($viewerId, $viewerIsManagerOrHigher) {
                    $sub->whereNotNull('assigned_to');
                    $sub->whereRaw("LOWER(COALESCE(status, '')) = 'pending'");
                    if ($viewerId > 0 && !$viewerIsManagerOrHigher) {
                        $sub->where(function ($owned) use ($viewerId) {
                            $owned->whereNull('assigned_to')
                                ->orWhere('assigned_to', '!=', $viewerId);
                        });
                    }
                })->orWhere(function ($sub) use ($viewerId, $viewerIsManagerOrHigher, $noActionAfterAssignmentSql) {
                    $sub->whereNotNull('assigned_to');
                    if ($viewerId > 0 && !$viewerIsManagerOrHigher) {
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

        $normalizedSql = "LOWER(TRIM(REPLACE(REPLACE(COALESCE(%s, ''), '_', ' '), '-', ' ')))";

        $query->where(function ($q) use ($displayStage, $normalizedSql) {
            $q->whereRaw(sprintf($normalizedSql, 'stage') . ' = ?', [$displayStage])
                ->orWhereHas('stageRelation', function ($stageQuery) use ($displayStage) {
                    $stageQuery
                        ->whereRaw("LOWER(TRIM(REPLACE(REPLACE(COALESCE(name, ''), '_', ' '), '-', ' '))) = ?", [$displayStage])
                        ->orWhereRaw("LOWER(TRIM(REPLACE(REPLACE(COALESCE(type, ''), '_', ' '), '-', ' '))) = ?", [$displayStage]);
                });
        });

        $query->where(function ($q) {
            $q->whereRaw("LOWER(COALESCE(stage, '')) != 'duplicate'")
                ->whereRaw("LOWER(COALESCE(status, '')) != 'duplicate'")
                ->whereNull('meta_data->duplicate_of')
                ->whereNull('meta_data->duplicateOf');
        });

        if ($this->canViewPendingDisplayStage($viewer, $scope)) {
            $query->where(function ($q) use ($viewerId, $viewerIsManagerOrHigher, $noActionAfterAssignmentSql) {
                $q->where(function ($statusScope) {
                    $statusScope->whereRaw("LOWER(COALESCE(status, '')) != 'pending'")
                        ->orWhereNull('assigned_to');
                });

                $q->where(function ($sub) use ($viewerId, $viewerIsManagerOrHigher, $noActionAfterAssignmentSql) {
                    $sub->whereNull('assigned_to');
                    if ($viewerId > 0 && !$viewerIsManagerOrHigher) {
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

    public function excludeDisplayOnlyLeadsFromDefaultList($query, ?User $viewer, string $scope = 'all'): void
    {
        $query->where(function ($q) {
            $q->whereRaw("LOWER(COALESCE(stage, '')) != 'duplicate'")
                ->whereRaw("LOWER(COALESCE(status, '')) != 'duplicate'");
        });

        $query->where(function ($q) {
            $q->whereNull('transferred_to_sales_at')
                ->where(function ($sub) {
                    $sub->whereNull('stage_id')
                        ->orWhereDoesntHave('stageRelation', function ($stageQuery) {
                            $stageQuery->whereRaw("LOWER(COALESCE(type, '')) = 'convert'");
                        });
                });
        });
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

    private function isDuplicateLead(Lead $lead): bool
    {
        $stage = $this->normalizeValue((string) ($lead->stage ?? ''));
        $status = $this->normalizeValue((string) ($lead->status ?? ''));
        $meta = is_array($lead->meta_data ?? null) ? ($lead->meta_data ?? []) : [];
        $duplicateOf = $meta['duplicate_of'] ?? $meta['duplicateOf'] ?? null;

        return $stage === 'duplicate'
            || $status === 'duplicate'
            || (is_numeric($duplicateOf) && (int) $duplicateOf > 0);
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

    private function isConvertLead(Lead $lead): bool
    {
        if (!empty($lead->transferred_to_sales_at)) {
            return true;
        }

        return $this->normalizeValue((string) ($lead->stageRelation?->type ?? '')) === 'convert';
    }

    private function decodeUserMetaData(?User $user): array
    {
        try {
            if (is_array($user?->meta_data)) {
                return $user->meta_data;
            }
            if (is_string($user?->meta_data)) {
                $decoded = json_decode($user->meta_data, true);

                return is_array($decoded) ? $decoded : [];
            }
        } catch (\Throwable $e) {
        }

        return [];
    }

    private function getControlModulePerms(?User $user): array
    {
        $meta = $this->decodeUserMetaData($user);
        $modulePerms = is_array($meta['module_permissions'] ?? null) ? ($meta['module_permissions'] ?? []) : [];
        $controlPerms = $modulePerms['Control'] ?? [];

        return is_array($controlPerms) ? $controlPerms : [];
    }

    private function hasControlModulePermission(?User $user, string $permissionKey): bool
    {
        return in_array($permissionKey, $this->getControlModulePerms($user), true);
    }

    private function hasTenantWideActionScope(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if (($user->is_super_admin ?? false) || $this->isHigherRole($user)) {
            return true;
        }

        return in_array($this->normalizedRole($user), ['telesales manager'], true);
    }

    private function canActOnTeamLead(?User $user, Lead $lead): bool
    {
        if (!$user) {
            return false;
        }

        if ($user->is_super_admin ?? false) {
            return true;
        }

        if (!$this->hasControlModulePermission($user, 'allowActionOnTeam')) {
            return false;
        }

        if ($this->hasTenantWideActionScope($user)) {
            return (int) ($lead->tenant_id ?? 0) === (int) ($user->tenant_id ?? 0);
        }

        $assignedTo = (int) ($lead->assigned_to ?? 0);
        if ($assignedTo <= 0) {
            return false;
        }

        $viewableUserIds = $this->getViewableUserIds($user);
        if ($viewableUserIds === null) {
            return false;
        }

        return in_array($assignedTo, array_map('intval', $viewableUserIds), true);
    }

    private function canAddActionToLead(?User $user, Lead $lead): bool
    {
        if (!$user) {
            return false;
        }

        if ((string) ($lead->assigned_to ?? '') === (string) ($user->id ?? '')) {
            return true;
        }

        if ($user->is_super_admin ?? false) {
            return true;
        }

        return $this->canActOnTeamLead($user, $lead);
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
        $viewerIsManagerOrHigher = $this->isHigherRole($viewer) || $this->isTelesalesManager($viewer) || $this->isTelesalesTeamLeader($viewer);
        $isOwner = $assignedTo > 0 && $viewerId > 0 && $assignedTo === $viewerId;
        $isUnassigned = $assignedTo <= 0;
        $status = $this->normalizeValue((string) ($lead->status ?? ''));

        if ($status === 'pending' && !$isUnassigned && (!$isOwner || $viewerIsManagerOrHigher)) {
            return true;
        }

        if (($isOwner && !$viewerIsManagerOrHigher) || $isUnassigned) {
            return false;
        }

        if (!$this->hasNoActionSinceAssignment($lead)) {
            return false;
        }

        return $this->isFreshLead($lead) || $this->isColdCallsLead($lead);
    }
}
