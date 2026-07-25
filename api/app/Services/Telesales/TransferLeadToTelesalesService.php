<?php

namespace App\Services\Telesales;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\Stage;
use App\Models\User;
use App\Services\TelesalesService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class TransferLeadToTelesalesService
{
    public function __construct(
        private readonly TelesalesService $telesalesService
    ) {
    }

    public function transfer(Lead $lead, User $actor, array $payload = []): Lead
    {
        $tenant = $this->telesalesService->getTenantForUser($actor);
        if (!$this->telesalesService->isEnabledForTenant($tenant)) {
            throw new AuthorizationException('Telesales module is disabled for this tenant.');
        }

        if (!$this->telesalesService->userHasPermission($actor, 'addLead')) {
            throw new AuthorizationException('You do not have permission to transfer leads into telesales.');
        }

        $tenantId = (int) ($actor->tenant_id ?? $lead->tenant_id ?? 0);
        $currentWorkflow = strtolower(trim((string) ($lead->workflow_key ?? TelesalesService::WORKFLOW_SALES)));
        if ($currentWorkflow === TelesalesService::WORKFLOW_TELESALES) {
            throw new \InvalidArgumentException('This lead is already inside the telesales workflow.');
        }

        $assignedTo = (int) ($payload['assigned_to'] ?? 0);
        if ($assignedTo <= 0) {
            throw new \InvalidArgumentException('A telesales assignee is required.');
        }

        $assignee = $this->telesalesService->validateTelesalesAssigneeId($tenantId, $assignedTo);
        $assignRole = strtolower(trim((string) ($payload['assign_role'] ?? 'sales'))) === 'manager' ? 'manager' : 'sales';
        $targetStageKey = strtolower(trim((string) ($payload['stage'] ?? 'new_lead')));
        $historyOption = strtolower(trim((string) ($payload['history_option'] ?? 'keep_history')));
        $preferredEntryStageId = isset($payload['telesales_entry_stage_id']) ? (int) $payload['telesales_entry_stage_id'] : null;

        $targetStageId = $this->resolveTargetStageId($tenantId, $targetStageKey, $preferredEntryStageId);
        if (!$targetStageId) {
            throw new \RuntimeException('Unable to resolve a telesales stage for this transfer.');
        }

        $previousAssignedTo = $lead->assigned_to;
        $previousStageId = $this->resolveExistingSalesStageId($lead, $tenantId);
        $previousStageLabel = $this->resolveExistingSalesStageLabel($lead, $previousStageId);
        $previousWorkflow = $lead->workflow_key;

        DB::transaction(function () use (
            $lead,
            $actor,
            $tenantId,
            $assignee,
            $assignRole,
            $targetStageKey,
            $targetStageId,
            $historyOption,
            $previousAssignedTo,
            $previousStageId,
            $previousStageLabel,
            $previousWorkflow
        ) {
            $lead->workflow_key = TelesalesService::WORKFLOW_TELESALES;
            $lead->stage_id = $targetStageId;
            $lead->workflow_entered_at = now();

            if (Schema::hasColumn('leads', 'transferred_to_sales_at')) {
                $lead->transferred_to_sales_at = null;
            }

            if ($assignRole === 'manager') {
                $lead->manager_id = $assignee?->id;
                $lead->assigned_to = null;
                $lead->sales_person = null;
                if (Schema::hasColumn('leads', 'assigned_at')) {
                    $lead->assigned_at = null;
                }
            } else {
                $lead->assigned_to = $assignee?->id;
                $lead->sales_person = $assignee?->name;
                $lead->manager_id = $this->resolveManagerIdForAssignee($assignee);
                if (Schema::hasColumn('leads', 'assigned_at')) {
                    $lead->assigned_at = now();
                }
            }

            $this->telesalesService->syncLeadStageFields($lead);
            $lead->save();

            if (Schema::hasColumn('leads', 'history_hidden_before_action_id')
                && Schema::hasColumn('leads', 'sales_view_reset_at')) {
                if ($historyOption === 'assign_as_new') {
                    $lastActionId = \App\Models\LeadAction::query()
                        ->where('lead_id', $lead->id)
                        ->max('id');

                    $lead->history_hidden_before_action_id = $lastActionId ?: null;
                    $lead->sales_view_reset_at = now();
                } else {
                    $lead->history_hidden_before_action_id = null;
                    $lead->sales_view_reset_at = null;
                }

                $lead->save();
            }

            $this->telesalesService->appendWorkflowHistory($lead, $actor, [
                'action' => 'transfer_to_telesales',
                'from_workflow' => $previousWorkflow ?: TelesalesService::WORKFLOW_SALES,
                'to_workflow' => TelesalesService::WORKFLOW_TELESALES,
                'from_stage_id' => $previousStageId,
                'to_stage_id' => $targetStageId,
                'meta_data' => [
                    'from_assigned_to' => $previousAssignedTo,
                    'from_assigned_to_name' => $this->resolveUserName($tenantId, $previousAssignedTo),
                    'from_stage_label' => $previousStageLabel,
                    'to_assigned_to' => $lead->assigned_to,
                    'to_assigned_to_name' => $lead->assigned_to ? ($assignee?->name ?: $this->resolveUserName($tenantId, $lead->assigned_to)) : null,
                    'to_manager_id' => $lead->manager_id,
                    'to_manager_name' => $this->resolveUserName($tenantId, $lead->manager_id),
                    'assign_role' => $assignRole,
                    'history_option' => $historyOption,
                    'target_stage_key' => $targetStageKey,
                ],
            ]);
        });

        return $lead->fresh(['assignedAgent:id,name', 'creator:id,name', 'stageRelation:id,name,name_ar,type,workflow_key']);
    }

    private function resolveTargetStageId(int $tenantId, string $targetStageKey, ?int $preferredEntryStageId = null): ?int
    {
        if ($targetStageKey === 'cold_calls') {
            $coldCallStage = Stage::query()
                ->where('tenant_id', $tenantId)
                ->where('workflow_key', TelesalesService::WORKFLOW_TELESALES)
                ->where(function ($query) {
                    $query
                        ->orWhereRaw("LOWER(TRIM(COALESCE(name, ''))) IN (?, ?, ?, ?)", [
                            'cold calls',
                            'cold call',
                            'prospects',
                            'potential customers',
                        ])
                        ->orWhereRaw("LOWER(TRIM(COALESCE(type, ''))) IN (?, ?, ?, ?, ?)", [
                            'cold calls',
                            'cold call',
                            'cold_calls',
                            'prospects',
                            'potential customers',
                        ]);
                })
                ->orderBy('order')
                ->first();

            if ($coldCallStage) {
                return (int) $coldCallStage->id;
            }
        }

        return $this->telesalesService->resolveEntryStageId(
            $tenantId,
            TelesalesService::WORKFLOW_TELESALES,
            $preferredEntryStageId
        );
    }

    private function resolveManagerIdForAssignee(?User $assignee): ?int
    {
        if (!$assignee) {
            return null;
        }

        $managerId = (int) ($assignee->manager_id ?? 0);
        if ($managerId > 0) {
            return $managerId;
        }

        try {
            $assignee->loadMissing('team');
            return (int) ($assignee->team?->leader_id ?? 0) ?: null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function resolveUserName(int $tenantId, ?int $userId): ?string
    {
        $userId = (int) $userId;
        if ($userId <= 0) {
            return null;
        }

        return User::query()
            ->where('tenant_id', $tenantId)
            ->whereKey($userId)
            ->value('name');
    }

    private function resolveExistingSalesStageId(Lead $lead, int $tenantId): ?int
    {
        $latestActionStageId = (int) LeadAction::query()
            ->where('tenant_id', $tenantId)
            ->where('lead_id', $lead->id)
            ->whereNotNull('stage_id_at_creation')
            ->latest('id')
            ->value('stage_id_at_creation');

        if ($latestActionStageId > 0) {
            $actionStage = Stage::query()
                ->where('tenant_id', $tenantId)
                ->where('workflow_key', TelesalesService::WORKFLOW_SALES)
                ->find($latestActionStageId);

            if ($actionStage) {
                return (int) $actionStage->id;
            }
        }

        $stageId = (int) ($lead->stage_id ?? 0);
        if ($stageId > 0) {
            return $stageId;
        }

        $stageValue = trim((string) ($lead->stage ?? ''));
        if ($stageValue === '') {
            return null;
        }

        $normalizedStage = $this->normalizeStageLookupValue($stageValue);
        if ($normalizedStage === '') {
            return null;
        }

        $stage = Stage::query()
            ->where('tenant_id', $tenantId)
            ->where('workflow_key', TelesalesService::WORKFLOW_SALES)
            ->where(function ($query) use ($normalizedStage) {
                $query
                    ->orWhereRaw("LOWER(TRIM(COALESCE(name, ''))) = ?", [$normalizedStage])
                    ->orWhereRaw("LOWER(TRIM(COALESCE(name_ar, ''))) = ?", [$normalizedStage])
                    ->orWhereRaw("LOWER(TRIM(COALESCE(type, ''))) = ?", [$normalizedStage]);
            })
            ->orderBy('order')
            ->first();

        return $stage ? (int) $stage->id : null;
    }

    private function resolveExistingSalesStageLabel(Lead $lead, ?int $stageId): ?string
    {
        if ($stageId) {
            $stage = Stage::query()->find($stageId);
            if ($stage) {
                return $stage->name_ar ?: $stage->name ?: $stage->type ?: null;
            }
        }

        $stageValue = trim((string) ($lead->stage ?? ''));
        return $stageValue !== '' ? $stageValue : null;
    }

    private function normalizeStageLookupValue(?string $value): string
    {
        $normalized = strtolower(trim((string) $value));
        $normalized = str_replace(['_', '-'], ' ', $normalized);
        return preg_replace('/\s+/', ' ', $normalized) ?: '';
    }
}
