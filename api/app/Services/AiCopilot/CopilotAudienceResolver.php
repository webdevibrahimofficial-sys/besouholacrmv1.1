<?php

namespace App\Services\AiCopilot;

use App\Models\Lead;
use App\Models\User;
use App\Traits\UserHierarchyTrait;

class CopilotAudienceResolver
{
    use UserHierarchyTrait;

    public function __construct(
        private readonly CopilotLeadAssigneeResolver $assigneeResolver,
    ) {
    }

    public function resolve(User $user, Lead $lead): array
    {
        $roles = $user->getRoleNames()->map(fn ($r) => strtolower((string) $r))->toArray();
        $roleLower = strtolower((string) ($user->role ?? ''));

        $isOwner = (int) ($lead->assigned_to ?? 0) === (int) $user->id;
        $isManagerOfLead = (int) ($lead->manager_id ?? 0) === (int) $user->id;

        $viewableIds = $this->getViewableUserIds($user);
        $inTeamScope = $viewableIds === null
            || in_array((int) ($lead->assigned_to ?? 0), $viewableIds, true)
            || $isManagerOfLead;

        if ($user->is_super_admin || $viewableIds === null) {
            $roleView = 'admin';
            $scope = $isOwner ? 'owner' : 'tenant';
        } elseif ($isManagerOfLead || ($viewableIds !== null && count($viewableIds) > 1 && ! $isOwner)) {
            $roleView = $this->isManagerRole($roleLower, $roles) ? 'manager' : 'team';
            $scope = 'team';
        } elseif ($isOwner) {
            $roleView = 'sales_person';
            $scope = 'owner';
        } else {
            $roleView = 'viewer';
            $scope = 'team';
        }

        return [
            'role_view' => $roleView,
            'scope' => $scope,
            'is_owner' => $isOwner,
            'is_manager_of_lead' => $isManagerOfLead,
            'can_act' => $isOwner || $inTeamScope,
            'assigned_to' => (int) ($lead->assigned_to ?? 0),
            'assigned_name' => $lead->assignedAgent?->name ?? null,
        ];
    }

    public function canView(User $user, Lead $lead): bool
    {
        if ((int) ($lead->tenant_id ?? 0) !== (int) ($user->tenant_id ?? 0)) {
            return false;
        }

        $viewableIds = $this->getViewableUserIds($user);
        if ($viewableIds === null) {
            return true;
        }

        $assignedTo = (int) ($lead->assigned_to ?? 0);

        if ($assignedTo <= 0) {
            if ($viewableIds === null) {
                return true;
            }

            if ($this->assigneeResolver->canAssignLeads($user)) {
                return true;
            }

            if ((int) ($lead->created_by ?? 0) === (int) $user->id) {
                return true;
            }

            return (int) ($lead->manager_id ?? 0) === (int) $user->id;
        }

        return in_array($assignedTo, $viewableIds, true)
            || (int) ($lead->manager_id ?? 0) === (int) $user->id
            || $assignedTo === (int) $user->id;
    }

    protected function isManagerRole(string $roleLower, array $roles): bool
    {
        foreach (['sales manager', 'telesales manager', 'team leader', 'manager'] as $needle) {
            if (str_contains($roleLower, $needle) || in_array($needle, $roles, true)) {
                return true;
            }
        }

        return false;
    }
}
