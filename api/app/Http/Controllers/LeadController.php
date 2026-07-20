<?php

namespace App\Http\Controllers;

use App\Models\Lead;
use App\Models\RecycleLead;
use App\Models\FieldValue;
use App\Models\Entity;
use App\Models\CrmSetting;
use App\Models\CancelReason;
use App\Models\User;
use App\Models\Activity;
use App\Models\Project;
use App\Models\Item;
use App\Models\Stage;
use App\Models\Tenant;
use App\Traits\ResolvesNotificationRecipients;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use App\Support\LeadStageResolver;
use App\Support\PhoneNormalizer;
use App\Support\TenantSourceLookup;
use App\Services\LeadRotationEngine;
use App\Services\TelesalesService;
use Illuminate\Support\Str;

use App\Models\LeadReferral;
use App\Notifications\LeadReferralAssignedNotification;

class LeadController extends Controller
{
    use \App\Traits\UserHierarchyTrait;
    use \App\Traits\ResolvesNotificationRecipients;

    private function tenantConnection()
    {
        return DB::connection(config('multitenancy.tenant_database_connection_name'));
    }

    /**
     * Recipients for duplicate notifications (management roles).
     * Uses broad matching on user.role and Spatie roles.
     */
    protected function getDuplicateNotificationRecipients(?int $tenantId): \Illuminate\Support\Collection
    {
        if (!$tenantId) {
            return collect();
        }

        $roleNames = ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager', 'operations manager', 'sales manager', 'sales admin', 'branch manager', 'team leader'];
        $roleNamesLower = array_map('strtolower', $roleNames);

        return \App\Models\User::where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->where(function ($q) use ($roleNamesLower) {
                $q->where(function ($sub) use ($roleNamesLower) {
                    foreach ($roleNamesLower as $r) {
                        $sub->orWhereRaw("lower(coalesce(role, '')) = ?", [$r]);
                        $sub->orWhereRaw("lower(coalesce(job_title, '')) = ?", [$r]);
                    }
                })
                ->orWhereHas('roles', function ($rq) use ($roleNamesLower) {
                    $rq->whereIn('name', $roleNamesLower);
                });
            })
            ->get();
    }
    use ResolvesNotificationRecipients;

    private function metaJsonTextExpression(string $column, string $path): string
    {
        $driver = DB::connection()->getDriverName();
        $jsonPath = '$.' . ltrim($path, '$.');

        return match ($driver) {
            'pgsql' => sprintf("%s #>> '{%s}'", $column, str_replace('.', ',', ltrim($path, '$.'))),
            'sqlite' => sprintf("json_extract(%s, '%s')", $column, $jsonPath),
            'sqlsrv' => sprintf("JSON_VALUE(%s, '%s')", $column, $jsonPath),
            default => sprintf("JSON_UNQUOTE(JSON_EXTRACT(%s, '%s'))", $column, $jsonPath),
        };
    }

    private function applyMetaDataTextFilter($query, string $path, array $values, string $column = 'leads.meta_data'): void
    {
        $values = array_values(array_filter(array_map(fn ($value) => trim((string) $value), $values), fn ($value) => $value !== ''));
        if (empty($values)) {
            return;
        }

        $expression = $this->metaJsonTextExpression($column, $path);
        $query->where(function ($q) use ($expression, $values) {
            foreach ($values as $value) {
                $q->orWhereRaw("{$expression} = ?", [$value]);
            }
        });
    }

    private function applyDuplicateWorkflowScope($query, ?int $tenantId, ?string $workflowKey): void
    {
        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $normalizedWorkflow = strtolower(trim((string) ($workflowKey ?? '')));
        if ($normalizedWorkflow === '' || !\Illuminate\Support\Facades\Schema::hasColumn('leads', 'workflow_key')) {
            return;
        }

        $query->where('workflow_key', $normalizedWorkflow);

        if ($normalizedWorkflow === TelesalesService::WORKFLOW_TELESALES
            && \Illuminate\Support\Facades\Schema::hasColumn('leads', 'transferred_to_sales_at')) {
            $query->whereNull('transferred_to_sales_at');
        }
    }

    private function applyProjectIdFilter($query, Request $request, $user): void
    {
        if (!$request->filled('project_id')) {
            return;
        }

        $inventoryIds = array_values(array_filter(
            array_map(fn ($value) => is_numeric($value) ? (int) $value : null, (array) $request->project_id),
            fn ($value) => !is_null($value)
        ));

        if (empty($inventoryIds)) {
            $query->whereRaw('1 = 0');
            return;
        }

        $projects = Project::query()
            ->when(!$user->is_super_admin, fn ($projectQuery) => $projectQuery->where('tenant_id', $user->tenant_id))
            ->whereIn('id', $inventoryIds)
            ->get(['id', 'name', 'name_ar']);

        $projectNames = $projects
            ->flatMap(function ($project) {
                return [
                    trim((string) ($project->name ?? '')),
                    trim((string) ($project->name_ar ?? '')),
                ];
            })
            ->filter()
            ->unique()
            ->values()
            ->all();

        $itemSelectColumns = ['id'];
        foreach (['name', 'title'] as $column) {
            if (\Illuminate\Support\Facades\Schema::hasColumn('items', $column)) {
                $itemSelectColumns[] = $column;
            }
        }

        $items = Item::query()
            ->when(!$user->is_super_admin, fn ($itemQuery) => $itemQuery->where('tenant_id', $user->tenant_id))
            ->whereIn('id', $inventoryIds)
            ->get($itemSelectColumns);

        $itemNames = $items
            ->flatMap(function ($item) {
                return [
                    trim((string) ($item->name ?? '')),
                    trim((string) ($item->title ?? '')),
                ];
            })
            ->filter()
            ->unique()
            ->values()
            ->all();

        $hasLeadItemColumn = \Illuminate\Support\Facades\Schema::hasColumn('leads', 'item');

        $query->where(function ($projectQuery) use ($inventoryIds, $projectNames, $itemNames, $hasLeadItemColumn) {
            $projectQuery->whereIn('leads.project_id', $inventoryIds)
                ->orWhereIn('leads.item_id', $inventoryIds);

            if (!empty($projectNames)) {
                $projectQuery->orWhereIn('leads.project', $projectNames);
            }

            if ($hasLeadItemColumn && !empty($itemNames)) {
                $projectQuery->orWhereIn('leads.item', $itemNames);
            }
        });
    }

    private function distinctMetaDataTextValues($query, string $path, string $alias = 'value', string $column = 'meta_data'): array
    {
        $expression = $this->metaJsonTextExpression($column, $path);

        return (clone $query)
            ->selectRaw("{$expression} as {$alias}")
            ->whereRaw("{$expression} is not null")
            ->distinct()
            ->limit(300)
            ->pluck($alias)
            ->map(fn ($value) => trim((string) $value))
            ->filter()
            ->values()
            ->all();
    }

    private function resolveDuplicateRootId(?Lead $lead, ?int $tenantId = null): ?int
    {
        if (!$lead) return null;

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

    /**
     * Find an "active" duplicate lead for the same phone + duplicate_of.
     * Active means it's still marked as duplicate (status or stage) and still linked via meta_data.duplicate_of.
     *
     * NOTE: We intentionally do not query JSON keys at SQL-level to avoid DB-engine/column-type coupling.
     */
    private function findActiveDuplicateLead(?int $tenantId, array $phoneVariants, ?int $duplicateOfId): ?Lead
    {
        if (!$duplicateOfId || empty($phoneVariants)) {
            return null;
        }

        $q = Lead::query()
            ->whereIn('phone', $phoneVariants)
            ->where(function ($w) {
                $w->whereRaw("lower(coalesce(status, '')) = 'duplicate'")
                  ->orWhereRaw("lower(coalesce(stage, '')) = 'duplicate'");
            })
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->limit(20);

        if ($tenantId) {
            $q->where('tenant_id', $tenantId);
        }

        $candidates = $q->get();
        foreach ($candidates as $cand) {
            $meta = is_array($cand->meta_data ?? null) ? ($cand->meta_data ?? []) : [];
            $dupOf = $meta['duplicate_of'] ?? null;
            if (is_numeric($dupOf) && (int) $dupOf === (int) $duplicateOfId) {
                return $cand;
            }
        }

        return null;
    }

    private function normalizeLeadScopeValue($value): string
    {
        return Str::of((string) ($value ?? ''))
            ->lower()
            ->replace(['_', '-'], ' ')
            ->squish()
            ->value();
    }

    private function userAllowsLeadSource(?User $user, ?string $leadSource): bool
    {
        if (!$user) {
            return true;
        }

        $allowedSources = collect($user->allowed_sources ?? [])
            ->map(fn ($value) => $this->normalizeLeadScopeValue($value))
            ->filter()
            ->unique()
            ->values();

        if ($allowedSources->isEmpty()) {
            return true;
        }

        $normalizedLeadSource = $this->normalizeLeadScopeValue($leadSource);
        if ($normalizedLeadSource === '') {
            return false;
        }

        return $allowedSources->contains($normalizedLeadSource);
    }

    private function resolveLeadProjectLabel(?Lead $lead, ?string $projectName = null, $projectId = null): ?string
    {
        $explicitName = trim((string) ($projectName ?? ''));
        if ($explicitName !== '') {
            return $explicitName;
        }

        $explicitProjectId = $projectId ?: ($lead?->project_id ?? null);
        if (!empty($explicitProjectId)) {
            $project = Project::find($explicitProjectId);
            $name = trim((string) ($project?->name ?? $project?->name_ar ?? ''));
            if ($name !== '') {
                return $name;
            }
        }

        $leadProject = trim((string) ($lead?->project ?? ''));
        return $leadProject !== '' ? $leadProject : null;
    }

    private function userAllowsLeadProject(?User $user, ?string $leadProject): bool
    {
        if (!$user) {
            return true;
        }

        $allowedProjects = collect($user->allowed_projects ?? [])
            ->map(fn ($value) => $this->normalizeLeadScopeValue($value))
            ->filter()
            ->unique()
            ->values();

        if ($allowedProjects->isEmpty()) {
            return true;
        }

        $normalizedLeadProject = $this->normalizeLeadScopeValue($leadProject);
        if ($normalizedLeadProject === '') {
            return false;
        }

        return $allowedProjects->contains($normalizedLeadProject);
    }

    private function ensureUserCanBeAssignedLeadSource(?User $user, ?string $leadSource): void
    {
        if (!$user || $this->userAllowsLeadSource($user, $leadSource)) {
            return;
        }

        $sourceLabel = trim((string) ($leadSource ?? '')) !== '' ? (string) $leadSource : 'Unknown';

        throw ValidationException::withMessages([
            'assigned_to' => [
                "Cannot assign this lead to {$user->name}. Lead source '{$sourceLabel}' is outside the user's allowed sources.",
            ],
        ]);
    }

    private function ensureUserCanBeAssignedLeadProject(?User $user, ?string $leadProject): void
    {
        if (!$user || $this->userAllowsLeadProject($user, $leadProject)) {
            return;
        }

        $projectLabel = trim((string) ($leadProject ?? '')) !== '' ? (string) $leadProject : 'Unknown';

        throw ValidationException::withMessages([
            'assigned_to' => [
                "Cannot assign this lead to {$user->name}. Lead project '{$projectLabel}' is outside the user's allowed projects.",
            ],
        ]);
    }

    /**
     * Track duplicate attempts in meta_data (non-breaking).
     *
     * @param array<string, mixed> $meta
     * @param array<string, mixed> $attempt
     * @return array<string, mixed>
     */
    private function bumpDuplicateAttemptMeta(array $meta, array $attempt): array
    {
        $count = (int) ($meta['duplicate_attempts_count'] ?? 0);
        $count++;
        $meta['duplicate_attempts_count'] = $count;
        $meta['last_duplicate_at'] = now()->toDateTimeString();

        $attempts = $meta['duplicate_attempts'] ?? null;
        $attempts = is_array($attempts) ? $attempts : [];
        if (!empty($attempt)) {
            $attempts[] = $attempt;
        }
        if (count($attempts) > 20) {
            $attempts = array_slice($attempts, -20);
        }
        $meta['duplicate_attempts'] = $attempts;

        return $meta;
    }

    /**
     * @param \App\Models\User|null $actor
     * @param array<string, mixed> $data
     * @param array<string, mixed> $meta
     * @param string $context
     * @return array<string, mixed>
     */
    private function buildDuplicateAttemptMeta($actor, array $data, array $meta, string $context): array
    {
        return array_filter([
            'at' => now()->toIso8601String(),
            'context' => $context,
            'by_id' => $actor?->id,
            'by_name' => $actor?->name,
            'entered_stage' => isset($meta['entered_stage']) ? (string) $meta['entered_stage'] : null,
            'source' => isset($data['source']) ? (string) $data['source'] : null,
            'project' => isset($data['project']) ? (string) $data['project'] : null,
            'assigned_to' => $data['assigned_to'] ?? null,
            'import_job_id' => $meta['import_job_id'] ?? null,
        ], fn ($v) => $v !== null && $v !== '');
    }

    /**
     * Keep the user's real pre-duplicate stage only.
     * "Duplicate" is an internal system stage and should never be stored
     * as the business stage the user selected before duplicate detection.
     */
    private function sanitizeDuplicateEnteredStage($stage): ?string
    {
        $stage = trim((string) $stage);
        if ($stage === '') {
            return null;
        }

        if (strtolower($stage) === 'duplicate') {
            return null;
        }

        return $stage;
    }

    private function resolveSalesAssignmentStageId(?int $tenantId, string $targetStage, ?int $fallbackStageId = null): ?int
    {
        /** @var TelesalesService $telesalesService */
        $telesalesService = app(TelesalesService::class);

        if ($targetStage === 'same_stage') {
            return $fallbackStageId ? (int) $fallbackStageId : null;
        }

        $salesStages = $telesalesService->getStagesForWorkflow($tenantId, TelesalesService::WORKFLOW_SALES, true);
        if ($salesStages->isEmpty()) {
            return $fallbackStageId ? (int) $fallbackStageId : null;
        }

        $targetTokens = $targetStage === 'cold_calls'
            ? ['cold calls', 'cold call', 'cold_calls', 'cold_call', 'coldcalls']
            : ['new lead', 'new', 'fresh'];

        $matchedStage = $salesStages->first(function ($stage) use ($targetTokens) {
            $name = strtolower(trim(str_replace(['_', '-'], ' ', (string) ($stage->name ?? ''))));
            $type = strtolower(trim(str_replace(['_', '-'], ' ', (string) ($stage->type ?? ''))));

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

    /**
     * Normalize a phone input into individual stored segments.
     * Supports slash/comma/pipe/newline separated values from the edit modal.
     *
     * @return array<int, string>
     */
    private function normalizePhoneInputSegments(?string $rawPhone, ?string $countryHint = null): array
    {
        $rawPhone = trim((string) $rawPhone);
        if ($rawPhone === '') {
            return [];
        }

        $segments = preg_split('/[\/,;|\n\r]+/', $rawPhone) ?: [];
        $normalized = [];
        foreach ($segments as $segment) {
            $segment = trim((string) $segment);
            if ($segment === '') {
                continue;
            }

            $phone = PhoneNormalizer::normalize($segment, $countryHint);
            if ($phone !== '') {
                $normalized[] = $phone;
            }
        }

        return array_values(array_unique($normalized));
    }
    
    protected function canViewDuplicates($user): bool
    {
        if (!$user) return false;
        if ($user->is_super_admin) return true;

        $roleLower = strtolower($user->role ?? '');
        $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();
        $allowed = [
            'tenant admin',
            'tenant-admin', // Keep both variants just in case
            'admin',        // Usually alias for tenant admin in some contexts
            'director',
            'operation manager',
            // 'sales admin', // Removed as per new requirement
            // 'branch manager', // Removed as per new requirement
            // 'sales person', // Removed
            // 'salesperson',
            // 'team leader', // Removed
            // 'teamleader'
        ];

        $isAllowedRole = in_array($roleLower, $allowed, true)
            || !empty(array_intersect($roles, $allowed));

        if ($isAllowedRole) {
            return true;
        }

        return $user->can('view-duplicate-leads');
    }

    /**
     * Check if user can delete leads.
     * Director and Operation Manager cannot delete leads.
     */
    protected function canDeleteLead($user): bool
    {
        if (!$user) return false;
        if ($user->is_super_admin) return true;

        $role = strtolower($user->role ?? '');
        // بناءً على الورقة: المدير ومدير العمليات ملهومش صلاحية حذف نهائياً
        if (in_array($role, ['director', 'operation manager'])) {
            return false;
        }

        // الـ Admin فقط هو اللي بيمسح
        if (in_array($role, ['admin', 'tenant admin', 'tenant-admin'], true)) {
            return true;
        }

        return $user->can('delete-lead');
    }

    public function canImportLeads(Request $request)
    {
        $user = $request->user();
        $role = strtolower($user->role ?? '');
        $allowedRoles = ['admin', 'tenant admin', 'director', 'operation manager', 'branch manager', 'sales admin', 'sales manager'];
        
        return response()->json([
            'can_import' => in_array($role, $allowedRoles) || $user->is_super_admin
        ]);
    }

    protected function decodeUserMetaData($user): array
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

    protected function getLeadModulePerms($user): array
    {
        $meta = $this->decodeUserMetaData($user);
        $modulePerms = is_array($meta['module_permissions'] ?? null) ? ($meta['module_permissions'] ?? []) : [];
        $leadPerms = $modulePerms['Leads'] ?? [];
        return is_array($leadPerms) ? $leadPerms : [];
    }

    protected function getControlModulePerms($user): array
    {
        $meta = $this->decodeUserMetaData($user);
        $modulePerms = is_array($meta['module_permissions'] ?? null) ? ($meta['module_permissions'] ?? []) : [];
        $controlPerms = $modulePerms['Control'] ?? [];
        return is_array($controlPerms) ? $controlPerms : [];
    }

    protected function isTenantAdminLike($user): bool
    {
        if (!$user) return false;
        if ($user->is_super_admin ?? false) return true;

        $roleLower = strtolower(trim((string)($user->role ?? $user->job_title ?? '')));
        return in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin'], true);
    }

    protected function hasTenantWideActionScope($user): bool
    {
        if (!$user) return false;
        if ($this->isTenantAdminLike($user)) return true;

        $roleLower = strtolower(trim((string)($user->role ?? $user->job_title ?? '')));
        return in_array($roleLower, ['director', 'operation manager', 'operations manager'], true);
    }

    protected function hasLeadModulePermission($user, string $permissionKey): bool
    {
        if ($this->isTenantAdminLike($user)) return true;
        return in_array($permissionKey, $this->getLeadModulePerms($user), true);
    }

    protected function hasControlModulePermission($user, string $permissionKey): bool
    {
        return in_array($permissionKey, $this->getControlModulePerms($user), true);
    }

    protected function canActOnTeamLead($user, $lead): bool
    {
        if (!$user || !$lead) return false;
        if ($user->is_super_admin) return true;
        if (!$this->hasControlModulePermission($user, 'allowActionOnTeam')) return false;

        if ($this->hasTenantWideActionScope($user)) {
            return (int) ($lead->tenant_id ?? 0) === (int) ($user->tenant_id ?? 0);
        }

        $assignedTo = (int) ($lead->assigned_to ?? 0);
        if ($assignedTo <= 0) return false;

        $viewableUserIds = $this->getViewableUserIds($user);
        if ($viewableUserIds === null) return false;

        $viewableUserIds = array_map('intval', $viewableUserIds);
        return in_array($assignedTo, $viewableUserIds, true);
    }

    protected function canAddActionToLead($user, $lead): bool
    {
        if (!$user || !$lead) return false;
        if ($this->isReferralSupervisor($user, $lead)) return false;

        if ((string) ($lead->assigned_to ?? '') === (string) ($user->id ?? '')) {
            return true;
        }

        if ($user->is_super_admin) {
            return true;
        }

        return $this->canActOnTeamLead($user, $lead);
    }

    protected function canViewLead($user, Lead $lead): bool
    {
        if (!$user || !$lead) {
            return false;
        }

        if (!$user->is_super_admin && (int) ($lead->tenant_id ?? 0) !== (int) ($user->tenant_id ?? 0)) {
            return false;
        }

        if ($this->isReferralSupervisor($user, $lead)) {
            return true;
        }

        $viewableIds = $this->getViewableUserIds($user);
        if ($viewableIds !== null) {
            $isManagerLike = $this->isBranchManager($user) || $this->isSalesAdmin($user) || $this->isSalesManager($user) || $this->isTeamLeader($user);
            if ($isManagerLike) {
                return in_array((int) ($lead->assigned_to ?? 0), array_map('intval', $viewableIds), true)
                    || (int) ($lead->manager_id ?? 0) === (int) ($user->id ?? 0);
            }

            return in_array((int) ($lead->assigned_to ?? 0), array_map('intval', $viewableIds), true);
        }

        return true;
    }

    protected function appendLeadPermissionsForList($paginatedLeads, $user)
    {
        if (!$paginatedLeads || !method_exists($paginatedLeads, 'getCollection')) {
            return $paginatedLeads;
        }

        $this->appendLeadDisplayLabels($paginatedLeads->getCollection());

        $paginatedLeads->getCollection()->transform(function ($lead) use ($user) {
            $existingPermissions = is_array($lead->permissions ?? null) ? $lead->permissions : [];
            $lead->permissions = array_merge($existingPermissions, [
                'can_add_action' => $this->canAddActionToLead($user, $lead),
                'is_referral_supervisor' => $this->isReferralSupervisor($user, $lead),
            ]);

            return $lead;
        });

        return $paginatedLeads;
    }

    /**
     * Populate display labels like project_name/item_name when only foreign keys exist.
     */
    private function appendLeadDisplayLabels($leads): void
    {
        $collection = collect($leads instanceof \Illuminate\Support\Collection ? $leads->all() : [$leads])
            ->filter(fn ($lead) => $lead instanceof Lead);

        if ($collection->isEmpty()) {
            return;
        }

        $projectIds = $collection->pluck('project_id')->filter()->unique()->values();
        $itemIds = $collection->pluck('item_id')->filter()->unique()->values();

        $projectsById = $projectIds->isEmpty()
            ? collect()
            : Project::query()
                ->whereIn('id', $projectIds)
                ->get(['id', 'name', 'name_ar'])
                ->keyBy('id');

        $itemSelectColumns = ['id'];
        foreach (['name', 'title'] as $column) {
            if (\Illuminate\Support\Facades\Schema::hasColumn('items', $column)) {
                $itemSelectColumns[] = $column;
            }
        }

        $itemsById = $itemIds->isEmpty()
            ? collect()
            : \App\Models\Item::query()
                ->whereIn('id', $itemIds)
                ->get($itemSelectColumns)
                ->keyBy('id');

        foreach ($collection as $lead) {
            $projectName = trim((string) ($lead->project_name ?? ''));
            if ($projectName === '' && !empty($lead->project_id)) {
                $project = $projectsById->get($lead->project_id);
                $projectName = trim((string) ($project?->name ?? $project?->name_ar ?? ''));
            }
            if ($projectName !== '') {
                $lead->setAttribute('project_name', $projectName);
            }

            $itemName = trim((string) ($lead->item_name ?? ''));
            if ($itemName === '' && !empty($lead->item_id)) {
                $item = $itemsById->get($lead->item_id);
                $itemName = trim((string) ($item?->name ?? $item?->title ?? ''));
            }
            if ($itemName !== '') {
                $lead->setAttribute('item_name', $itemName);
            }
        }
    }

    
    /**
     * Check if user can delete users.
     * Director and Operation Manager cannot delete users.
     */
    protected function canDeleteUser($user): bool
    {
        if (!$user) return false;
        if ($user->is_super_admin) return true;

        $roleLower = strtolower($user->role ?? '');
        
        // Explicitly deny Director and Operation Manager
        if (str_contains($roleLower, 'director') || str_contains($roleLower, 'operation manager')) {
            return false;
        }

        // Allow Admin and Tenant Admin
        if (in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin'], true)) {
            return true;
        }

        return $user->can('delete-user');
    }

    protected function isBranchManager($user): bool
    {
        if (!$user) return false;
        $roleLower = strtolower($user->role ?? '');
        return str_contains($roleLower, 'branch manager');
    }

    protected function isSalesAdmin($user): bool
    {
        if (!$user) return false;
        $roleLower = strtolower($user->role ?? '');
        return str_contains($roleLower, 'sales admin');
    }

    protected function isReferralSupervisor($user, $lead)
    {
        if (!$user || !$lead) return false;
        
        return $lead->assigned_to != $user->id && 
               \App\Models\LeadReferral::where('lead_id', $lead->id)
                                       ->where('user_id', $user->id)
                                       ->exists();
    }

    /**
     * Bulk assign referral supervisor to leads.
     */
    public function bulkAssignReferral(Request $request)
    {
        $request->validate([
            'lead_ids' => 'required|array',
            'lead_ids.*' => 'exists:leads,id',
            'referral_user_id' => 'required|exists:users,id',
        ]);

        $referralUser = User::findOrFail($request->referral_user_id);
        $currentUser = $request->user();

        // 1. Referral user must belong to same tenant
        if ($referralUser->tenant_id !== $currentUser->tenant_id) {
             return response()->json(['message' => 'Referral user must belong to the same tenant.'], 403);
        }

        DB::beginTransaction();
        try {
            $leads = Lead::with('assignedAgent')->whereIn('id', $request->lead_ids)->lockForUpdate()->get();
            $successCount = 0;
            $errors = [];
            $notifications = [];

            foreach ($leads as $lead) {
                // 2. Lead must belong to authenticated tenant (Global scope usually handles this, but explicit check is safer)
                if ($lead->tenant_id !== $currentUser->tenant_id) {
                    $errors[] = "Lead {$lead->id}: Unauthorized tenant access.";
                    continue;
                }

                // 3. Referral user cannot be the assigned user
                if ($lead->assigned_to == $referralUser->id) {
                    $errors[] = "Lead {$lead->id}: Cannot assign referral supervisor as the assigned user.";
                    continue;
                }

                // 4. Role hierarchy enforcement (Removed)
                /*
                $assignedUser = $lead->assignedAgent;
                if ($assignedUser) {
                    // Default role_level to 0 if null
                    $referralLevel = $referralUser->role_level ?? 0;
                    $assignedLevel = $assignedUser->role_level ?? 0;
                    
                    if ($referralLevel <= $assignedLevel) {
                         $errors[] = "Lead {$lead->id}: Referral supervisor ({$referralUser->name}) must have a higher role level than the assigned user ({$assignedUser->name}).";
                         continue;
                    }
                }
                */

                // 5. Insert into lead_referrals (Ignore duplicates)
                $exists = LeadReferral::where('lead_id', $lead->id)
                            ->where('user_id', $referralUser->id)
                            ->exists();
                
                if (!$exists) {
                    LeadReferral::create([
                        'tenant_id' => $currentUser->tenant_id,
                        'lead_id' => $lead->id,
                        'user_id' => $referralUser->id,
                        'referrer_id' => $currentUser->id,
                    ]);
                    
                    // 6. Queue Notification (send after commit)
                    $notifications[] = [
                        'user' => $referralUser,
                        'notification' => new LeadReferralAssignedNotification($lead, $currentUser)
                    ];
                    $successCount++;
                }
            }

            if (count($errors) > 0) {
                DB::rollBack();
                // Return 403 as requested if ANY violation occurs
                return response()->json([
                    'message' => 'Validation failed for some leads.',
                    'errors' => $errors
                ], 403);
            }

            DB::commit();

            // Send notifications after commit
            foreach ($notifications as $item) {
                try {
                    $item['user']->notify($item['notification']);
                } catch (\Exception $e) {
                    // Log error but don't fail the request
                    \Illuminate\Support\Facades\Log::error('Failed to send referral notification: ' . $e->getMessage());
                }
            }

            return response()->json(['message' => "Successfully assigned referral supervisor to {$successCount} leads."]);

        } catch (\Exception $e) {
            DB::rollBack();
            \Illuminate\Support\Facades\Log::error('Bulk Assign Referral Error: ' . $e->getMessage());
            return response()->json(['message' => 'Server Error', 'error' => $e->getMessage()], 500);
        }
    }

    public function bulkRemoveReferral(Request $request)
    {
        $request->validate([
            'lead_ids' => 'required|array',
            'lead_ids.*' => 'exists:leads,id',
        ]);

        $currentUser = $request->user();
        $roleLower = strtolower((string) ($currentUser->role ?? ''));
        $canManage = $currentUser->is_super_admin ||
            in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager', 'sales admin', 'branch manager','team leader'], true);

        if (!$canManage) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        DB::beginTransaction();
        try {
            $leads = Lead::whereIn('id', $request->lead_ids)->lockForUpdate()->get(['id', 'tenant_id', 'assigned_to']);

            foreach ($leads as $lead) {
                if ($lead->tenant_id !== $currentUser->tenant_id) {
                    DB::rollBack();
                    return response()->json(['message' => 'Unauthorized tenant access.'], 403);
                }
            }

            $removed = 0;
            foreach ($leads as $lead) {
                $q = LeadReferral::query()
                    ->where('tenant_id', $currentUser->tenant_id)
                    ->where('lead_id', $lead->id);

                if (!empty($lead->assigned_to)) {
                    $q->where('user_id', '!=', (int) $lead->assigned_to);
                }

                $removed += (int) $q->delete();
            }

            DB::commit();

            return response()->json([
                'message' => 'Referral removed',
                'removed' => $removed,
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            \Illuminate\Support\Facades\Log::error('Bulk Remove Referral Error: ' . $e->getMessage());
            return response()->json(['message' => 'Server Error', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Get eligible referral supervisors for a list of leads.
     */
    public function getReferralSupervisors(Request $request)
    {
        $request->validate([
            'lead_ids' => 'nullable|array', // Optional: if provided, filter by hierarchy relative to these leads
            'lead_ids.*' => 'exists:leads,id',
        ]);

        $user = $request->user();

        // Referral assignees should be Sales Persons only (same tenant).
        // We infer this from either the stored job_title or the Spatie role name.
        $query = User::where('tenant_id', $user->tenant_id)
            ->where('id', '!=', $user->id)
            ->where(function ($q) {
                $q->whereRaw("LOWER(COALESCE(job_title,'')) LIKE '%sales%'")
                    ->orWhereHas('roles', function ($rq) {
                        $rq->whereRaw("LOWER(name) LIKE '%sales%'");
                    });
            })
            ->where(function ($q) {
                $q->whereNull('status')
                    ->orWhere('status', '')
                    ->orWhereRaw("LOWER(status) = 'active'");
            });

        /*
        if ($request->has('lead_ids') && !empty($request->lead_ids)) {
            // Find max role level of assigned users
            $maxAssignedLevel = Lead::whereIn('id', $request->lead_ids)
                ->join('users', 'leads.assigned_to', '=', 'users.id')
                ->max('users.role_level') ?? 0;

            $query->where('role_level', '>', $maxAssignedLevel);
        }
        */

        return response()->json($query->select('id', 'name', 'role_level')->get());
    }

    /**
     * Display a listing of referral leads.
     */
    public function referralIndex(Request $request)
    {
        try {
            $user = $request->user();
            
            // 1. Build Base Query
            $query = Lead::query()
                ->select('leads.*', 'lr.user_id as referral_user_id', 'lr.referrer_id', 'lr.created_at as referral_date')
                ->join('lead_referrals as lr', 'lr.lead_id', '=', 'leads.id');

            // Virtual Stage Logic:
            // If user is NOT the referral receiver (Manager/Admin)
            // AND stage is New/Cold Calls
            // AND no actions exist
            // THEN show 'pending'
            $query->addSelect(DB::raw("
                CASE 
                    WHEN (lower(leads.stage) IN ('new', 'new lead', 'cold calls', 'cold-call', 'coldcalls'))
                    AND NOT EXISTS (SELECT 1 FROM lead_actions WHERE lead_actions.lead_id = leads.id)
                    THEN 'pending'
                    ELSE leads.stage
                END as visible_stage
            "));

            // 2. Explicitly enforce tenant scope
            if (!$user->is_super_admin) {
                $query->where('leads.tenant_id', $user->tenant_id);
            }

            // 3. Visibility Logic per Role
            $roleLower = strtolower($user->role ?? '');
            $isAdminOrDirector = $user->is_super_admin || 
                                in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

            if (!$isAdminOrDirector) {
                $viewableUserIds = $this->getViewableUserIds($user);
                if ($viewableUserIds !== null) {
                    $query->whereIn('lr.user_id', $viewableUserIds);
                } else {
                    $query->where('lr.user_id', $user->id);
                }
            }

            // 4. Apply COMPREHENSIVE Filters
            $this->applyReferralFilters($query, $request);

            // 5. Eager Loading
            $query->with([
                'assignedAgent:id,name',
                'referral.user:id,name',
                'referral.referrer:id,name',
                'latestAction'
            ]);

            // 6. Sorting
            $sortBy = $request->get('sort_by', 'lr.created_at');
            $sortOrder = $request->get('sort_order', 'desc');
            
            $sortMap = [
                'createdAt' => 'lr.created_at',
                'created_at' => 'lr.created_at',
                'referral_date' => 'lr.created_at',
                'name' => 'leads.name',
                'email' => 'leads.email',
                'phone' => 'leads.phone',
                'company' => 'leads.company',
                'stage' => 'leads.stage',
                'priority' => 'leads.priority',
                'source' => 'leads.source',
            ];

            $orderColumn = $sortMap[$sortBy] ?? 'lr.created_at';
            $query->orderBy($orderColumn, $sortOrder);

            $results = $query->paginate($request->get('per_page', 10));

            // Logic Adjustment: Referral Receiver should ALWAYS see the real stage
            $results->getCollection()->transform(function($lead) use ($user) {
                // If current user is the one who received this referral, show the actual stage
                if ((string)$lead->referral_user_id === (string)$user->id) {
                    $lead->visible_stage = $lead->stage;
                }
                return $lead;
            });

            return $results;

        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Referral Leads Index Error: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to fetch referral leads',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Apply comprehensive filters for referral leads.
     */
    private function applyReferralFilters($query, Request $request)
    {
        // Search
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('leads.name', 'like', "%{$search}%")
                  ->orWhere('leads.email', 'like', "%{$search}%")
                  ->orWhere('leads.phone', 'like', "%{$search}%")
                  ->orWhere('leads.company', 'like', "%{$search}%");
            });
        }

        // Basic Lead Fields
        if ($request->filled('source')) $query->whereIn('leads.source', (array)$request->source);
        if ($request->filled('priority')) $query->whereIn('leads.priority', (array)$request->priority);
        if ($request->filled('project')) $query->whereIn('leads.project', (array)$request->project);
        if ($request->filled('stage')) $query->whereIn('leads.stage', (array)$request->stage);
        if ($request->filled('campaign')) $query->whereIn('leads.campaign', (array)$request->campaign);
        if ($request->filled('location')) $query->whereIn('leads.location', (array)$request->location);
        if ($request->filled('manager_id')) $query->where('leads.manager_id', $request->manager_id);
        if ($request->filled('created_by')) $query->where('leads.created_by', $request->created_by);
        if ($request->filled('email')) $query->where('leads.email', 'like', "%{$request->email}%");
        
        // Referral Specific Fields
        if ($request->filled('referral_to')) $query->whereIn('lr.user_id', (array)$request->referral_to);
        if ($request->filled('referrer_id')) $query->whereIn('lr.referrer_id', (array)$request->referrer_id);
        if ($request->filled('assigned_to')) $query->whereIn('leads.assigned_to', (array)$request->assigned_to);
        if ($request->filled('manager_id')) $query->whereIn('leads.manager_id', (array)$request->manager_id);
        
        // Date Filters for Referrals
        if ($request->filled('assign_date')) $query->whereDate('lr.created_at', $request->assign_date);
        if ($request->filled('creation_date')) $query->whereDate('leads.created_at', $request->creation_date);
        if ($request->filled('closed_date')) $query->whereDate('leads.closed_at', $request->closed_date);
        
        // Lead's assigned_at date filter
        if ($request->filled('assigned_date_from')) $query->whereDate('leads.assigned_at', '>=', $request->assigned_date_from);
        if ($request->filled('assigned_date_to')) $query->whereDate('leads.assigned_at', '<=', $request->assigned_date_to);
        
        // Lead's actual last action timestamp filter
        if ($request->filled('last_action_date_from')) $query->whereDate('leads.last_action_at', '>=', $request->last_action_date_from);
        if ($request->filled('last_action_date_to')) $query->whereDate('leads.last_action_at', '<=', $request->last_action_date_to);

        // Action Type Filter
        if ($request->filled('action_type')) {
            $actionTypes = (array)$request->action_type;
            $query->whereExists(function ($q) use ($actionTypes) {
                $q->select(DB::raw(1))
                  ->from('lead_actions')
                  ->whereColumn('lead_actions.lead_id', 'leads.id')
                  ->whereIn('lead_actions.action_type', $actionTypes);
            });
        }
    }

    /**
     * Get meetings report.
     */
    public function meetingsReport(Request $request)
    {
        try {
            $user = $request->user();
            $tenantId = $user->tenant_id;

            $query = $this->tenantConnection()->table('leads')
                ->join('lead_actions', 'lead_actions.lead_id', '=', 'leads.id')
                ->leftJoin('users', 'users.id', '=', 'leads.assigned_to')
                ->where('lead_actions.action_type', 'meeting')
                ->where('leads.tenant_id', $tenantId)
                ->whereNull('leads.deleted_at');

            // Visibility Logic
            $roleLower = strtolower($user->role ?? '');
            $isAdminOrDirector = $user->is_super_admin || 
                                in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

            if (!$isAdminOrDirector) {
                $viewableUserIds = $this->getViewableUserIds($user);
                if ($viewableUserIds !== null) {
                    $query->whereIn('leads.assigned_to', $viewableUserIds);
                } else {
                    $query->where('leads.assigned_to', $user->id);
                }
            }

            // Apply Filters
            if ($request->filled('sales_person')) {
                $query->whereIn('leads.assigned_to', (array)$request->sales_person);
            }
            if ($request->filled('manager_id')) {
                $requestedManagers = array_values(array_filter(array_map('trim', (array) $request->manager_id), fn($v) => $v !== ''));
                $viewableIds = [];
                foreach ($requestedManagers as $managerId) {
                    $ids = $this->getViewableUserIds($user, is_numeric($managerId) ? (int) $managerId : $managerId);
                    if (is_array($ids) && !empty($ids)) {
                        $viewableIds = array_merge($viewableIds, $ids);
                    }
                }
                $viewableIds = array_values(array_unique(array_map('intval', $viewableIds)));
                if (!empty($viewableIds)) {
                    $query->whereIn('leads.assigned_to', $viewableIds);
                } else {
                    $query->whereRaw('1 = 0');
                }
            }
            if ($request->filled('project')) {
                $query->whereIn('leads.project', (array)$request->project);
            }
            if ($request->filled('source')) {
                $query->whereIn('leads.source', (array)$request->source);
            }
            if ($request->filled('start_date')) {
                $query->where('lead_actions.details->date', '>=', $request->start_date);
            }
            if ($request->filled('end_date')) {
                $query->where('lead_actions.details->date', '<=', $request->end_date);
            }
            if ($request->filled('meeting_date')) {
                $query->where('lead_actions.details->date', $request->meeting_date);
            }

            $results = $query->select(
                'leads.id',
                'leads.name',
                'leads.phone',
                'leads.source',
                'leads.project',
                'leads.assigned_to',
                'users.name as sales_person',
                DB::raw("COUNT(lead_actions.id) as arranged_meetings"),
                DB::raw("COUNT(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(lead_actions.details, '$.meeting_status')) = 'done' OR JSON_UNQUOTE(JSON_EXTRACT(lead_actions.details, '$.doneMeeting')) = 'true' THEN 1 END) as done_meetings"),
                DB::raw("COUNT(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(lead_actions.details, '$.meeting_status')) = 'no_show' THEN 1 END) as missed_meetings"),
                DB::raw("MAX(JSON_UNQUOTE(JSON_EXTRACT(lead_actions.details, '$.date'))) as meeting_date")
            )
            ->groupBy('leads.id', 'leads.name', 'leads.phone', 'leads.source', 'leads.project', 'leads.assigned_to', 'users.name')
            ->get()
            ->map(function($item) {
                $arranged = (int)$item->arranged_meetings;
                $done = (int)$item->done_meetings;
                // Calculate Score = (Done / Arrange) * 100
                $item->score = $arranged > 0 ? round(($done / $arranged) * 100) : 0;
                return $item;
            });

            return response()->json($results);

        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Meetings Report Error: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to fetch meetings report',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Get distinct values for referral filters.
     */
    public function referralFilters(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }
            
            $tenantId = $user->tenant_id;

            // 1. Get Distinct values directly from DB tables for speed and safety
            $referredLeadQuery = $this->tenantConnection()->table('leads')
                ->join('lead_referrals', 'leads.id', '=', 'lead_referrals.lead_id')
                ->where('leads.tenant_id', $tenantId);

            // Simple Visibility Logic (Avoiding Trait methods if possible for debugging)
            $roleLower = strtolower($user->role ?? '');
            $isAdminOrDirector = $user->is_super_admin || 
                                in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

            if (!$isAdminOrDirector) {
                // If not admin, filter by referrals assigned to the user or their team
                try {
                    $viewableUserIds = $this->getViewableUserIds($user);
                    if ($viewableUserIds !== null) {
                        $referredLeadQuery->whereIn('lead_referrals.user_id', $viewableUserIds);
                    } else {
                        $referredLeadQuery->where('lead_referrals.user_id', $user->id);
                    }
                } catch (\Exception $e) {
                    // Fallback if trait fails
                    $referredLeadQuery->where('lead_referrals.user_id', $user->id);
                }
            }

            // Fetch Options with explicit column naming
            $projects = (clone $referredLeadQuery)->whereNotNull('leads.project')->where('leads.project', '!=', '')->distinct()->pluck('leads.project');
            $campaigns = (clone $referredLeadQuery)->whereNotNull('leads.campaign')->where('leads.campaign', '!=', '')->distinct()->pluck('leads.campaign');

            // Countries (From settings/locations/countries table)
            $countries = $this->tenantConnection()->table('countries')
                ->where('tenant_id', $tenantId)
                ->where('status', true)
                ->orderBy('name_en')
                ->get(['id', 'name_en', 'name_ar']);

            // Stages
            $stages = $this->tenantConnection()->table('stages')->where('tenant_id', $tenantId)->orderBy('order')->get(['id', 'name', 'name_ar', 'icon', 'color']);

            // Managers
            $managerIds = $this->tenantConnection()->table('users')->where('tenant_id', $tenantId)->whereNotNull('manager_id')->distinct()->pluck('manager_id');
            $managers = $this->tenantConnection()->table('users')->whereIn('id', $managerIds)->get(['id', 'name']);

            // Receivers
            $receiverIds = $this->tenantConnection()->table('lead_referrals')->where('tenant_id', $tenantId)->distinct()->pluck('user_id');
            $salesPersons = $this->tenantConnection()->table('users')->whereIn('id', $receiverIds)->get(['id', 'name']);

            // Referrers
            $referrerIds = $this->tenantConnection()->table('lead_referrals')->where('tenant_id', $tenantId)->distinct()->pluck('referrer_id');
            $referrers = $this->tenantConnection()->table('users')->whereIn('id', $referrerIds)->get(['id', 'name']);

            return response()->json([
                'stages' => $stages,
                'projects' => $projects->filter()->values()->map(fn($p) => ['id' => $p, 'name' => $p]),
                'countries' => $countries->map(fn($c) => [
                    'id' => $c->name_en, // Use name_en as value to match lead table column 'location'
                    'name' => $c->name_en,
                    'name_ar' => $c->name_ar
                ]),
                'campaigns' => $campaigns->filter()->values()->map(fn($c) => ['id' => $c, 'name' => $c]),
                'managers' => $managers,
                'salesPersons' => $salesPersons,
                'referrers' => $referrers,
            ]);

        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Referral Filters Error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            return response()->json([
                'message' => 'Failed to fetch filters',
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ], 500);
        }
    }

    /**
     * Get stats for referral leads.
     */
    public function referralStats(Request $request)
    {
        try {
            $user = $request->user();
            
            // Base query joined with lead_referrals
            $query = Lead::query()
                ->join('lead_referrals as lr', 'lr.lead_id', '=', 'leads.id');

            // Explicitly enforce tenant scope
            if (!$user->is_super_admin) {
                $query->where('leads.tenant_id', $user->tenant_id);
            }

            // Visibility Logic per Role (Same as referralIndex)
            $roleLower = strtolower($user->role ?? '');
            $isAdminOrDirector = $user->is_super_admin || 
                                in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

            if (!$isAdminOrDirector) {
                $viewableUserIds = $this->getViewableUserIds($user);
                if ($viewableUserIds !== null) {
                    $query->whereIn('lr.user_id', $viewableUserIds);
                } else {
                    $query->where('lr.user_id', $user->id);
                }
            }

            // Apply COMPREHENSIVE Filters (Sync with Index)
            $this->applyReferralFilters($query, $request);

            // Aggregate counts with Virtual Stage Logic
            // Note: We clone the query to avoid affecting the original for grouped counts
            $countsQuery = (clone $query);
            
            // To accurately count 'pending' vs 'new'/'cold calls', we need to check actions
            $counts = $countsQuery->selectRaw("
                count(*) as total,
                count(case when (
                    (lower(leads.stage) IN ('new', 'new lead', 'cold calls', 'cold-call', 'coldcalls'))
                    AND NOT EXISTS (SELECT 1 FROM lead_actions WHERE lead_actions.lead_id = leads.id)
                ) then 1 end) as pending_count,
                
                count(case when (
                    (lower(leads.stage) IN ('new', 'new lead'))
                    AND (
                        EXISTS (SELECT 1 FROM lead_actions WHERE lead_actions.lead_id = leads.id)
                        OR lr.user_id = ?
                    )
                ) then 1 end) as new_count,

                count(case when (
                    (lower(leads.stage) IN ('cold calls', 'cold-call', 'coldcalls'))
                    AND (
                        EXISTS (SELECT 1 FROM lead_actions WHERE lead_actions.lead_id = leads.id)
                        OR lr.user_id = ?
                    )
                ) then 1 end) as cold_call_count,

                count(case when lower(leads.stage) = 'duplicate' then 1 end) as duplicate_count
            ", [$user->id, $user->id])->first();

            // Group by visible_stage for dynamic pipeline cards
            // Since visible_stage depends on the user, we'll calculate it in the query
            $byStage = (clone $query)->select(DB::raw("
                CASE 
                    WHEN lr.user_id = $user->id THEN leads.stage
                    WHEN (lower(leads.stage) IN ('new', 'new lead', 'cold calls', 'cold-call', 'coldcalls'))
                    AND NOT EXISTS (SELECT 1 FROM lead_actions WHERE lead_actions.lead_id = leads.id)
                    THEN 'pending'
                    ELSE leads.stage
                END as effective_stage
            "), DB::raw('count(*) as count'))
                           ->whereNotNull('leads.stage')
                           ->groupBy('effective_stage')
                           ->pluck('count', 'effective_stage');

            return response()->json([
                'total' => $counts->total ?? 0,
                'new' => $counts->new_count ?? 0,
                'pending' => $counts->pending_count ?? 0,
                'coldCall' => $counts->cold_call_count ?? 0,
                'duplicate' => $counts->duplicate_count ?? 0,
                'byStage' => $byStage
            ]);

        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Referral Leads Stats Error: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to fetch referral stats', 
                'error' => $e->getMessage(),
                'total' => 0,
                'new' => 0,
                'pending' => 0,
                'coldCall' => 0,
                'duplicate' => 0,
                'byStage' => []
            ], 500);
        }
    }

    /**
     * Build filtered query for leads.
     */
    private function buildFilteredLeadsQuery(Request $request, $user, bool $includeDuplicates = false)
    {
        $query = Lead::query();

        $workflowFilter = strtolower(trim((string) $request->input('workflow_key', '')));
        if (!in_array($workflowFilter, [TelesalesService::WORKFLOW_SALES, TelesalesService::WORKFLOW_TELESALES], true)) {
            $workflowFilter = TelesalesService::WORKFLOW_SALES;
        }
        $query->where('leads.workflow_key', $workflowFilter);

        // Explicitly enforce tenant scope
        if (!$user->is_super_admin) {
            $query->where('leads.tenant_id', $user->tenant_id);
        }

        // 1. Hierarchy/Visibility Visibility
        $requestedManagerId = null;
        if ($request->filled('manager_id') && is_numeric($request->manager_id)) {
            $requestedManagerId = (int) $request->manager_id;
        }

        $viewableIds = $this->getViewableUserIds($user, $requestedManagerId);
        if ($viewableIds !== null) {
            $isManagerLike = $this->isBranchManager($user) || $this->isSalesAdmin($user) || $this->isSalesManager($user) || $this->isTeamLeader($user);
            if ($isManagerLike) {
                $query->where(function ($q) use ($viewableIds, $user) {
                    $q->whereIn('leads.assigned_to', $viewableIds)
                      ->orWhere('leads.manager_id', $user->id);
                });
            } elseif ($requestedManagerId) {
                $query->where(function ($q) use ($viewableIds, $requestedManagerId) {
                    $q->whereIn('leads.assigned_to', $viewableIds)
                      ->orWhere('leads.manager_id', $requestedManagerId);
                });
            } else {
                $query->whereIn('leads.assigned_to', $viewableIds);
            }
        }

        // 2. Duplicate Filtering
        $crm = \App\Models\CrmSetting::first();
        $enableDup = is_array($crm?->settings) ? (bool)($crm->settings['duplicationSystem'] ?? false) : false;

        // Duplicates should be excluded from normal views/reports for everyone.
        // They should only show up when explicitly requested by privileged users (Duplicate stage view),
        // or when an endpoint needs to compute duplicate counts.
        $requestingDuplicates = false;
        if ($includeDuplicates) {
            $requestingDuplicates = true;
        } elseif ($request->has('stage')) {
            $st = array_map(fn($v) => strtolower(trim((string)$v)), (array)$request->stage);
            if (in_array('duplicate', $st, true) && $this->canViewDuplicates($user)) {
                $requestingDuplicates = true;
            }
        }

        if ($enableDup && !$requestingDuplicates) {
            $query->where(function($q) {
                $q->where(function($s) {
                    $s->whereRaw("leads.status is null or leads.status != 'duplicate'");
                })->where(function($st) {
                    $st->whereRaw("leads.stage is null or leads.stage != 'duplicate'");
                });
            });
        }

        // 3. Search
        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $terms = preg_split('/\s+/', $search) ?: [];
            $terms = array_values(array_filter(array_map('trim', $terms), fn($t) => $t !== ''));
            $terms = array_slice($terms, 0, 5);

            $phoneVariants = PhoneNormalizer::isPhoneLike($search)
                ? PhoneNormalizer::variantsForSearch($search)
                : [];

            $query->where(function ($q) use ($search, $terms, $phoneVariants) {
                $applyTerm = function ($sub, string $term) use ($phoneVariants) {
                    $sub->where('leads.name', 'like', "%{$term}%")
                        ->orWhere('leads.email', 'like', "%{$term}%")
                        ->orWhere('leads.company', 'like', "%{$term}%")
                        ->orWhere('leads.notes', 'like', "%{$term}%")
                        ->orWhereHas('assignedAgent', function ($subQ) use ($term) {
                            $subQ->where('name', 'like', "%{$term}%");
                        })
                        // Search inside "Last Comment" column (latest action description/notes)
                        ->orWhereHas('latestAction', function ($aq) use ($term) {
                            $aq->where('description', 'like', "%{$term}%")
                                ->orWhere('details->notes', 'like', "%{$term}%");
                        });

                    if (!empty($phoneVariants)) {
                        foreach ($phoneVariants as $pv) {
                            $sub->orWhere('leads.phone', 'like', "%{$pv}%");
                        }
                    } else {
                        $sub->orWhere('leads.phone', 'like', "%{$term}%");
                    }
                };

                // Single term = classic OR search; multi term = AND across words (each word matches somewhere)
                if (count($terms) <= 1) {
                    $term = $terms[0] ?? $search;
                    $q->where(function ($sub) use ($applyTerm, $term) {
                        $applyTerm($sub, $term);
                    });
                } else {
                    foreach ($terms as $t) {
                        $q->where(function ($sub) use ($applyTerm, $t) {
                            $applyTerm($sub, $t);
                        });
                    }
                }
            });
        }

        // 4. Stage Filter
        if ($request->filled('stage')) {
            $stages = (array)$request->stage;
            if (in_array('duplicate', $stages)) {
                $query->where(function($q) use ($stages) {
                    $q->whereIn('leads.stage', $stages)
                      ->orWhere('leads.status', 'duplicate');
                });
            } else {
                $this->applyStageFilter($query, $stages, $user, $request);
            }
        }

        // 5. Basic Filters
        foreach (['priority', 'campaign', 'country', 'created_by'] as $filter) {
            if ($request->filled($filter)) {
                $query->whereIn("leads.$filter", (array)$request->$filter);
            }
        }

        $this->applyProjectIdFilter($query, $request, $user);

        if ($request->filled('agency')) {
            $this->applyMetaDataTextFilter($query, 'agency', (array) $request->agency);
        }

        if ($request->filled('cancel_reason')) {
            $cancelReasonIds = array_values(array_filter(
                array_map(fn ($value) => is_numeric($value) ? (int) $value : null, (array) $request->cancel_reason),
                fn ($value) => !is_null($value)
            ));

            if (empty($cancelReasonIds)) {
                $query->whereRaw('1 = 0');
            } else {
                $cancelReasons = CancelReason::query()
                    ->when(!$user->is_super_admin, fn ($reasonQuery) => $reasonQuery->where('tenant_id', $user->tenant_id))
                    ->whereIn('id', $cancelReasonIds)
                    ->get(['id', 'title', 'title_ar']);

                if ($cancelReasons->isEmpty()) {
                    $query->whereRaw('1 = 0');
                } else {
                    $query->whereHas('actions', function ($actionQuery) use ($cancelReasons) {
                        $actionQuery->where('lead_actions.action_type', 'cancel')
                            ->where(function ($reasonQuery) use ($cancelReasons) {
                                foreach ($cancelReasons as $reason) {
                                    $reasonId = (int) $reason->id;
                                    $title = trim((string) ($reason->title ?? ''));
                                    $titleAr = trim((string) ($reason->title_ar ?? ''));

                                    $reasonQuery->orWhere('lead_actions.details->cancel_reason_id', $reasonId);

                                    if ($title !== '') {
                                        $reasonQuery->orWhere('lead_actions.details->cancel_reason', $title);
                                    }

                                    if ($titleAr !== '') {
                                        $reasonQuery->orWhere('lead_actions.details->cancel_reason_ar', $titleAr)
                                            ->orWhere('lead_actions.details->cancel_reason', $titleAr);
                                    }
                                }
                            });
                    });
                }
            }
        }

        // Old Stage Filter
        // Interprets "old stage" as any historical stage captured on lead actions via stage_id_at_creation.
        if ($request->filled('old_stage')) {
            $requestedOldStages = array_values(array_filter(
                array_map(fn ($value) => trim((string) $value), (array) $request->old_stage),
                fn ($value) => $value !== ''
            ));

            if (!empty($requestedOldStages)) {
                $stageIds = \App\Models\Stage::query()
                    ->when(!$user->is_super_admin, function ($stageQuery) use ($user) {
                        $stageQuery->where(function ($tenantScope) use ($user) {
                            $tenantScope->where('tenant_id', $user->tenant_id)
                                ->orWhereNull('tenant_id');
                        });
                    })
                    ->whereIn('name', $requestedOldStages)
                    ->pluck('id')
                    ->map(fn ($id) => (int) $id)
                    ->filter()
                    ->values()
                    ->all();

                if (empty($stageIds)) {
                    $query->whereRaw('1 = 0');
                } else {
                    $query->whereHas('actions', function ($actionQuery) use ($stageIds) {
                        $actionQuery->whereIn('lead_actions.stage_id_at_creation', $stageIds);
                    });
                }
            }
        }

        if ($user?->isAgencyScopedMarketingUser() && filled($user->agency_id)) {
            $this->applyMetaDataTextFilter($query, 'agency_id', [(string) $user->agency_id]);
        }

        // Handle Source filter with normalization (e.g., "Cold Calls" matches "cold-call")
         if ($request->filled('source')) {
             $sources = (array)$request->source;
             $query->where(function($q) use ($sources) {
                     foreach ($sources as $s) {
                     $q->orWhere('leads.source', $s)
                       ->orWhere('leads.source', strtolower($s));
                     
                     // Normalize "Cold Calls" variations
                     $sNorm = strtolower(str_replace([' ', '_', '-'], '', $s));
                     if ($sNorm === 'coldcalls' || $sNorm === 'coldcall') {
                         $q->orWhereIn('leads.source', [
                             'cold-call', 'Cold-Call', 'cold call', 'Cold Call', 
                             'coldcalls', 'ColdCalls', 'cold_call', 'Cold_Call'
                         ]);
                     }
                 }
             });
         }

        // 6. Manager Filter (Recursive tree)
        if ($requestedManagerId) {
            $root = \App\Models\User::where('tenant_id', $user->tenant_id)->find($requestedManagerId);
            if ($root) {
                $subtreeIds = $this->collectSubordinatesIds($root);
                $subtreeIds[] = (int) $root->id;
                $query->where(function ($q) use ($requestedManagerId, $subtreeIds) {
                    $q->whereIn('leads.assigned_to', $subtreeIds)
                      ->orWhere('leads.manager_id', $requestedManagerId);
                });
            }
        }

        // 7. Assigned User Filter
        if ($request->filled('assigned_to')) {
            $assignedTo = (array)$request->assigned_to;
            $ids = array_filter($assignedTo, 'is_numeric');
            $names = array_diff($assignedTo, $ids);

            $hasSalesPersonCol = false;
            try {
                $hasSalesPersonCol = \Illuminate\Support\Facades\Schema::hasColumn('leads', 'sales_person');
            } catch (\Throwable $e) {
                $hasSalesPersonCol = false;
            }

            $query->where(function($q) use ($ids, $names, $hasSalesPersonCol) {
                if (!empty($ids)) $q->whereIn('leads.assigned_to', $ids);
                if (!empty($names)) {
                    $q->orWhereHas('assignedAgent', function($sq) use ($names) {
                        $sq->whereIn('name', $names);
                    });
                    if ($hasSalesPersonCol) {
                        $q->orWhereIn('leads.sales_person', $names);
                    }
                }
            });
        }

        // 8. Date Range Filters
        // Creation Date Filter
        if ($request->filled('created_from')) $query->whereDate('leads.created_at', '>=', $request->created_from);
        if ($request->filled('created_to')) $query->whereDate('leads.created_at', '<=', $request->created_to);
        
        // Last Action Date Filter
        // Uses last_action_at which is populated only from real lead_actions.
        // Support both parameter names: last_action_from/to (legacy) and last_action_date_from/to (frontend)
        $lastActionFrom = $request->filled('last_action_date_from') ? $request->last_action_date_from : $request->last_action_from;
        $lastActionTo = $request->filled('last_action_date_to') ? $request->last_action_date_to : $request->last_action_to;
        
        if ($lastActionFrom) $query->whereDate('leads.last_action_at', '>=', $lastActionFrom);
        if ($lastActionTo) $query->whereDate('leads.last_action_at', '<=', $lastActionTo);

        // Action Date Filter (from Action History)
        // Returns ALL leads that have ANY action within the date range
        // NOT filtered by last action - searches full action history
        if ($request->filled('action_date_from') || $request->filled('action_date_to')) {
            $query->whereHas('actions', function ($actionQuery) use ($request) {
                if ($request->filled('action_date_from')) {
                    $actionQuery->whereDate('lead_actions.created_at', '>=', $request->action_date_from);
                }
                if ($request->filled('action_date_to')) {
                    $actionQuery->whereDate('lead_actions.created_at', '<=', $request->action_date_to);
                }
            });
        }

        // Action Type Filter (from Action History)
        // Returns ALL leads that have ANY action matching the selected types.
        if ($request->filled('action_type')) {
            $actionTypes = array_values(array_filter((array) $request->action_type, fn ($value) => trim((string) $value) !== ''));
            if (!empty($actionTypes)) {
                $query->whereHas('actions', function ($actionQuery) use ($actionTypes) {
                    $actionQuery->whereIn('lead_actions.action_type', $actionTypes);
                });
            }
        }

        // Assigned Date Filter
        // Frontend sends: assigned_date_from / assigned_date_to
        $assignedAtCol = null;
        try {
            if (\Illuminate\Support\Facades\Schema::hasColumn('leads', 'assigned_at')) {
                $assignedAtCol = 'assigned_at';
            } elseif (\Illuminate\Support\Facades\Schema::hasColumn('leads', 'assigned_date')) {
                $assignedAtCol = 'assigned_date';
            }
        } catch (\Throwable $e) {
            $assignedAtCol = null;
        }

        if ($assignedAtCol) {
            if ($request->filled('assigned_date_from')) $query->whereDate("leads.$assignedAtCol", '>=', $request->assigned_date_from);
            if ($request->filled('assigned_date_to')) $query->whereDate("leads.$assignedAtCol", '<=', $request->assigned_date_to);
        }

        // Optional: Closed date range (depends on DB schema, so guard by column existence).
        // Frontend sends: closed_from / closed_to
        $closedCol = null;
        foreach (['closed_at', 'closed_date'] as $c) {
            try {
                if (\Illuminate\Support\Facades\Schema::hasColumn('leads', $c)) {
                    $closedCol = $c;
                    break;
                }
            } catch (\Throwable $e) {
            }
        }
        if ($closedCol) {
            if ($request->filled('closed_from')) $query->whereDate("leads.$closedCol", '>=', $request->closed_from);
            if ($request->filled('closed_to')) $query->whereDate("leads.$closedCol", '<=', $request->closed_to);
        }

        return $query;
    }

    private function resolveLeadStageVisibilityContext(Request $request, User $user): array
    {
        $scopeUser = $user;
        if ($request->filled('manager_id') && is_numeric($request->manager_id)) {
            $managerId = (int) $request->manager_id;
            $managerUser = \App\Models\User::query()
                ->when(!$user->is_super_admin, fn($q) => $q->where('tenant_id', $user->tenant_id))
                ->find($managerId);
            if ($managerUser) {
                $scopeUser = $managerUser;
            }
        }

        $assignedToFilter = $request->input('assigned_to');
        $hasSalesPersonFilter =
            (is_array($assignedToFilter) && count(array_filter($assignedToFilter, fn($v) => $v !== null && $v !== '')) > 0)
            || (!is_array($assignedToFilter) && $assignedToFilter !== null && $assignedToFilter !== '');

        $viewType = $request->get('view_type', 'all_leads');
        $roleLower = strtolower((string) ($scopeUser->role ?? ''));
        $isManager = !in_array($roleLower, ['sales person', 'salesperson'], true);
        $isAllLeadsView = $viewType === 'all_leads';

        return [
            'scopeUser' => $scopeUser,
            'currentUserId' => (int) $scopeUser->id,
            'hasSalesPersonFilter' => $hasSalesPersonFilter,
            'isManager' => $isManager,
            'isAllLeadsView' => $isAllLeadsView,
            'virtualPendingFlag' => ($isAllLeadsView && $isManager) ? 1 : 0,
        ];
    }

    private function buildLeadDisplayStageSql(array $context, string $table = 'leads'): string
    {
        // Real stage mode:
        // 1. Any explicit Sales Person filter is active
        // 2. The current scoped user is a Sales Person
        // In both cases we must not apply manager-facing virtual pending remapping.
        if (!empty($context['hasSalesPersonFilter']) || empty($context['isManager'])) {
            return "
                CASE
                    WHEN ({$table}.stage IS NULL OR {$table}.stage = '')
                         AND ({$table}.status IS NULL OR {$table}.status = '')
                    THEN 'new lead'
                    WHEN {$table}.stage IS NULL OR {$table}.stage = '' THEN {$table}.status
                    ELSE {$table}.stage
                END
            ";
        }

        $currentUserId = (int) ($context['currentUserId'] ?? 0);
        $virtualPendingFlag = (int) ($context['virtualPendingFlag'] ?? 0);
        $noActionAfterResetSql = $this->buildLeadNoActionAfterResetSql($table);

        return "
            CASE
                WHEN {$virtualPendingFlag} = 1
                     AND {$table}.assigned_to = {$currentUserId}
                     AND (lower({$table}.stage) = 'new' or lower({$table}.stage) = 'new lead' or (lower({$table}.status) = 'new' and {$table}.stage is null))
                     AND {$noActionAfterResetSql}
                THEN 'pending'
                WHEN (lower({$table}.stage) = 'new' or lower({$table}.stage) = 'new lead' or (lower({$table}.status) = 'new' and {$table}.stage is null))
                     AND COALESCE({$table}.assigned_to, 0) > 0
                     AND {$table}.assigned_to != {$currentUserId}
                     AND {$noActionAfterResetSql}
                THEN 'pending'
                WHEN (lower({$table}.stage) in ('coldcalls','cold calls','cold-call','cold_call','cold_calls','cold call'))
                     AND COALESCE({$table}.assigned_to, 0) > 0
                     AND ({$table}.assigned_to != {$currentUserId} OR {$virtualPendingFlag} = 1)
                     AND {$noActionAfterResetSql}
                THEN 'pending'
                WHEN ({$table}.stage IS NULL OR {$table}.stage = '')
                     AND ({$table}.status IS NULL OR {$table}.status = '')
                THEN 'new lead'
                WHEN {$table}.stage IS NULL OR {$table}.stage = ''
                THEN {$table}.status
                ELSE {$table}.stage
            END
        ";
    }

    private function buildLeadPendingResetAnchorSql(string $table = 'leads'): string
    {
        // If a lead was reassigned/reset and returned to New Lead / Cold Calls, managers should
        // see it as Pending again until a newer action is added after that reset point.
        return "
            CASE
                WHEN COALESCE({$table}.assigned_to, 0) > 0
                     AND (lower(COALESCE({$table}.status, '')) = 'pending' OR lower(COALESCE({$table}.status, '')) = 'in-progress')
                THEN COALESCE({$table}.sales_view_reset_at, {$table}.assigned_at, {$table}.updated_at, {$table}.created_at)
                ELSE COALESCE({$table}.sales_view_reset_at, {$table}.assigned_at, {$table}.created_at)
            END
        ";
    }

    private function buildLeadNoActionAfterResetSql(string $table = 'leads'): string
    {
        $anchorSql = $this->buildLeadPendingResetAnchorSql($table);
        return "NOT EXISTS (
            SELECT 1
            FROM lead_actions
            WHERE lead_actions.lead_id = {$table}.id
              AND lead_actions.created_at > ({$anchorSql})
        )";
    }

    public function pipelineReport(Request $request)
    {
        try {
            $user = $request->user();

            // Reporting should exclude duplicates by default.
            $query = $this->buildFilteredLeadsQuery($request, $user, false);
            // Do not exclude referral leads from this report; they can be assigned and owned like normal leads.

            if ($request->filled('project')) {
                $query->whereIn('project', (array) $request->project);
            }

            // Use last_action_at so the report only includes real actions
            $hasLastActionRange = $request->filled('last_action_date_from') || $request->filled('last_action_date_to');
            if ($hasLastActionRange) {
                if ($request->filled('last_action_date_from')) {
                    $query->whereDate('leads.last_action_at', '>=', $request->last_action_date_from);
                }
                if ($request->filled('last_action_date_to')) {
                    $query->whereDate('leads.last_action_at', '<=', $request->last_action_date_to);
                }
            } elseif ($request->filled('last_action_date')) {
                $query->whereDate('leads.last_action_at', $request->last_action_date);
            }

            $isRTL = $request->get('lang') === 'ar';
            $unassignedLabel = $isRTL ? 'غير معين' : 'Unassigned';

            $distinctStages = (clone $query)
                ->whereNotNull('stage')
                ->select('stage')
                ->distinct()
                ->limit(300)
                ->pluck('stage')
                ->filter()
                ->values()
                ->all();

            $distinctSources = (clone $query)
                ->whereNotNull('source')
                ->select('source')
                ->distinct()
                ->limit(300)
                ->pluck('source')
                ->filter()
                ->values()
                ->all();

            $distinctAgencies = $this->distinctMetaDataTextValues($query, 'agency', 'agency', 'meta_data');

            $distinctProjects = (clone $query)
                ->whereNotNull('project')
                ->select('project')
                ->distinct()
                ->limit(300)
                ->pluck('project')
                ->filter()
                ->values()
                ->all();

            $userQuery = \App\Models\User::query();
            if (!$user->is_super_admin) {
                $userQuery->where('tenant_id', $user->tenant_id);
            }
            $usersById = $userQuery->get(['id', 'name'])->keyBy('id');

            $scopeUser = $user;
            if ($request->filled('manager_id') && is_numeric($request->manager_id)) {
                $managerId = (int) $request->manager_id;
                $managerUser = \App\Models\User::query()
                    ->when(!$user->is_super_admin, fn($q) => $q->where('tenant_id', $user->tenant_id))
                    ->find($managerId);
                if ($managerUser) {
                    $scopeUser = $managerUser;
                }
            }

            $currentUserId = $scopeUser->id;
            $viewType = $request->get('view_type', 'all_leads');
            $isManager = !in_array(strtolower($scopeUser->role ?? ''), ['sales person', 'salesperson']);
            $isAllLeadsView = $viewType === 'all_leads';
            $virtualPendingFlag = ($isAllLeadsView && $isManager) ? 1 : 0;
            $noActionAfterResetSql = $this->buildLeadNoActionAfterResetSql('leads');

            $pendingCountRow = (clone $query)->selectRaw("
                count(case when (
                    CASE
                        WHEN ? = 1 AND assigned_to = ? AND (lower(stage) = 'new' or lower(stage) = 'new lead' or (lower(status) = 'new' and stage is null))
                             AND {$noActionAfterResetSql}
                        THEN 'pending'
                        WHEN (lower(stage) = 'new' or lower(stage) = 'new lead' or (lower(status) = 'new' and stage is null)) AND COALESCE(assigned_to, 0) > 0 AND assigned_to != ?
                             AND {$noActionAfterResetSql}
                        THEN 'pending'
                        WHEN (lower(stage) in ('coldcalls','cold calls','cold-call','cold_call','cold_calls','cold call')) AND COALESCE(assigned_to, 0) > 0 AND (assigned_to != ? OR ? = 1)
                             AND {$noActionAfterResetSql}
                        THEN 'pending'
                        ELSE stage
                    END
                ) = 'pending' then 1 end) as pending_count
            ", [$virtualPendingFlag, $currentUserId, $currentUserId, $currentUserId, $virtualPendingFlag])->first();

            $pendingCount = (int) ($pendingCountRow->pending_count ?? 0);

            $totals = [
                'totalLeads' => 0,
                'pending' => $pendingCount,
                'meetings' => 0,
                'proposals' => 0,
                'reservations' => 0,
                'closedDeals' => 0,
                'cancelation' => 0,
            ];

            $bySales = [];
            $monthly = [];

            $maxLeads = (int) $request->input('max_leads', 50000);
            if ($maxLeads <= 0) {
                $maxLeads = 50000;
            }

            $seen = 0;
            // Some tenants might not have these optional columns (assigned_at / closed_at).
            // Selecting a non-existing column causes a 500.
            $columns = ['id', 'name', 'assigned_to', 'manager_id', 'stage', 'status', 'source', 'project', 'created_at', 'updated_at'];
            try {
                if (\Illuminate\Support\Facades\Schema::hasColumn('leads', 'assigned_at')) {
                    $columns[] = 'assigned_at';
                }
                if (\Illuminate\Support\Facades\Schema::hasColumn('leads', 'closed_at')) {
                    $columns[] = 'closed_at';
                }
                if (\Illuminate\Support\Facades\Schema::hasColumn('leads', 'sales_person')) {
                    $columns[] = 'sales_person';
                }
            } catch (\Throwable $e) {
                // If schema introspection fails for any reason, keep a safe baseline.
            }

            $query->orderBy('id')->select($columns);

            $query->chunkById(2000, function ($leadsChunk) use (&$seen, $maxLeads, $usersById, $unassignedLabel, &$totals, &$bySales, &$monthly, $currentUserId, $virtualPendingFlag) {
                foreach ($leadsChunk as $lead) {
                    if ($seen >= $maxLeads) {
                        return false;
                    }
                    $seen += 1;

                    $salespersonName = $unassignedLabel;
                    if ($lead->assigned_to && isset($usersById[$lead->assigned_to])) {
                        $salespersonName = $usersById[$lead->assigned_to]->name ?: $unassignedLabel;
                    } elseif (!empty($lead->sales_person)) {
                        $fallbackName = trim((string) $lead->sales_person);
                        if ($fallbackName !== '') {
                            $salespersonName = $fallbackName;
                        }
                    }

                    $stage = strtolower(trim((string) ($lead->stage ?? '')));
                    $status = strtolower(trim((string) ($lead->status ?? '')));
                    $assignedTo = (int) ($lead->assigned_to ?? 0);

                    $isNewStage = $stage === 'new' || $stage === 'new lead' || ($status === 'new' && $stage === '');
                    $isColdStage = in_array($stage, ['coldcalls', 'cold calls', 'cold-call', 'cold_call', 'cold_calls', 'cold call'], true)
                        || str_contains($stage, 'cold')
                        || str_contains($stage, '????');
                    $isExplicitPendingStage = in_array($stage, ['pending', 'in-progress'], true)
                        || in_array($status, ['pending', 'in-progress'], true);

                    $isPendingNew = false;
                    $isPendingCold = false;

                    if ($assignedTo > 0) {
                        if ($isExplicitPendingStage) {
                            $isPendingNew = true;
                        } elseif ($virtualPendingFlag == 1 && $assignedTo === $currentUserId && $isNewStage) {
                            $isPendingNew = true;
                        } elseif ($isNewStage && $assignedTo !== $currentUserId) {
                            $isPendingNew = true;
                        } elseif ($isColdStage && ($assignedTo !== $currentUserId || $virtualPendingFlag == 1)) {
                            $isPendingCold = true;
                        }
                    }

                    $totals['totalLeads'] += 1;
                    if (str_contains($stage, 'meeting') || str_contains($stage, 'اجتماع')) {
                        $totals['meetings'] += 1;
                    }
                    if (str_contains($stage, 'proposal') || str_contains($stage, 'عرض')) {
                        $totals['proposals'] += 1;
                    }
                    if (str_contains($stage, 'reservation') || str_contains($stage, 'حجز')) {
                        $totals['reservations'] += 1;
                    }
                    if (str_contains($stage, 'closing') || str_contains($stage, 'closed') || str_contains($stage, 'إغلاق') || in_array($status, ['converted', 'won', 'فوز'], true)) {
                        $totals['closedDeals'] += 1;
                    }
                    if (str_contains($stage, 'cancel') || str_contains($stage, 'إلغاء') || in_array($status, ['canceled', 'lost', 'خسارة'], true)) {
                        $totals['cancelation'] += 1;
                    }

                    $monthKey = null;
                    if ($lead->created_at) {
                        $monthKey = $lead->created_at->format('Y-m');
                        $monthly[$monthKey] = ($monthly[$monthKey] ?? 0) + 1;
                    }

                    if (!isset($bySales[$salespersonName])) {
                        $bySales[$salespersonName] = [
                            'name' => $salespersonName,
                            'total' => 0,
                            'pendingNew' => 0,
                            'pendingCold' => 0,
                            'followUp' => 0,
                            'proposal' => 0,
                            'meeting' => 0,
                            'reservation' => 0,
                            'closed' => 0,
                            'canceled' => 0,
                        ];
                    }

                    $bySales[$salespersonName]['total'] += 1;
                    if ($isPendingNew) {
                        $bySales[$salespersonName]['pendingNew'] += 1;
                    }
                    if ($isPendingCold) {
                        $bySales[$salespersonName]['pendingCold'] += 1;
                    }
                    if (str_contains($stage, 'follow') || str_contains($stage, 'متابعة')) {
                        $bySales[$salespersonName]['followUp'] += 1;
                    }
                    if (str_contains($stage, 'proposal') || str_contains($stage, 'عرض')) {
                        $bySales[$salespersonName]['proposal'] += 1;
                    }
                    if (str_contains($stage, 'meeting') || str_contains($stage, 'اجتماع')) {
                        $bySales[$salespersonName]['meeting'] += 1;
                    }
                    if (str_contains($stage, 'reservation') || str_contains($stage, 'حجز')) {
                        $bySales[$salespersonName]['reservation'] += 1;
                    }
                    if (str_contains($stage, 'closing') || str_contains($stage, 'closed') || str_contains($stage, 'إغلاق') || in_array($status, ['converted', 'won', 'فوز'], true)) {
                        $bySales[$salespersonName]['closed'] += 1;
                    }
                    if (str_contains($stage, 'cancel') || str_contains($stage, 'إلغاء') || in_array($status, ['canceled', 'lost', 'خسارة'], true)) {
                        $bySales[$salespersonName]['canceled'] += 1;
                    }
                }
                return true;
            });

            ksort($monthly);
            $monthlySeries = [];
            foreach ($monthly as $month => $count) {
                $monthlySeries[] = ['month' => $month, 'count' => $count];
            }

            $salesStats = array_values($bySales);
            usort($salesStats, fn($a, $b) => ($b['total'] ?? 0) <=> ($a['total'] ?? 0));

            return response()->json([
                'totals' => $totals,
                'salesPersonStats' => $salesStats,
                'monthly' => $monthlySeries,
                'options' => [
                    'stages' => $distinctStages,
                    'sources' => $distinctSources,
                    'agencies' => $distinctAgencies,
                    'projects' => $distinctProjects,
                ],
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Leads Pipeline Report Error: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to fetch leads pipeline report',
                'error' => $e->getMessage(),
                'totals' => [
                    'totalLeads' => 0,
                    'pending' => 0,
                    'meetings' => 0,
                    'proposals' => 0,
                    'reservations' => 0,
                    'closedDeals' => 0,
                    'cancelation' => 0,
                ],
                'salesPersonStats' => [],
                'monthly' => [],
                'options' => [
                    'stages' => [],
                    'sources' => [],
                    'agencies' => [],
                    'projects' => [],
                ],
            ], 500);
        }
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        try {
            $user = $request->user();
            $query = $this->buildFilteredLeadsQuery($request, $user);

            $stageVisibility = $this->resolveLeadStageVisibilityContext($request, $user);
            $displayStageSql = $this->buildLeadDisplayStageSql($stageVisibility);

            // Add virtual display_stage
            $query->select('leads.*');
            $query->selectRaw("{$displayStageSql} as display_stage");

            // Eager loading
            $query->with([
                'customFieldValues.field', 
                'assignedAgent:id,name', 
                'creator:id,name', 
                'latestAction' => function($q) use ($user) {
                    // Hide actions marked as manager-only for non-admins
                    $roleLower = strtolower($user->role ?? '');
                    $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();
                    
                    $isAdmin = str_contains($roleLower, 'admin') || 
                               in_array('admin', $roles) || 
                               in_array('tenant admin', $roles) ||
                               $user->is_super_admin;
                    
                    if (!$isAdmin) {
                        $q->where(function($sub) {
                            $sub->whereNull('details->visibility')
                                ->orWhere('details->visibility', '!=', 'manager');
                        });
                    }
                }
            ]);

            // Sorting
            $sortBy = $request->get('sort_by');
            $sortOrder = $request->get('sort_order', 'desc');

            if (!$sortBy) {
                $this->applyLeadsSmartOrdering($query, $request, $user);
            } else {
                if ($sortBy === 'createdAt') $sortBy = 'created_at';
                if ($sortBy === 'updatedAt') $sortBy = 'updated_at';

                if (in_array($sortBy, ['name', 'created_at', 'updated_at', 'estimated_value', 'stage'], true)) {
                    $query->orderBy("leads.$sortBy", $sortOrder);
                } else {
                    $query->latest();
                }
            }

            $results = $query->paginate($request->get('per_page', 10));

            return $this->appendLeadPermissionsForList($results, $user);

        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Leads Index Error: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to fetch leads', 'error' => $e->getMessage(), 'data' => []], 500);
        }
    }

    /**
     * Default "smart" ordering rule for Leads Management.
     *
     * - Total Leads + New Leads + Duplicates + Pending + Cold Calls:
     *   sort by creation date (newest first).
     * - Other stages:
     *   sort by Next Action Date (latest scheduled follow-up first).
     */
    private function applyLeadsSmartOrdering($query, Request $request, $user): void
    {
        $creationStages = [
            'new',
            'new lead',
            'new_lead',
            'newlead',
            'duplicate',
            'duplicates',
            'pending',
            'in-progress',
            'in progress',
            'inprogress',
            'cold calls',
            'coldcalls',
            'cold-call',
            'cold_call',
            'cold_calls',
            'cold call',
        ];

        $requestedStages = collect($request->input('stage', []))
            ->map(fn($stage) => strtolower(trim((string) $stage)))
            ->filter()
            ->values();

        if ($requestedStages->isEmpty() || $requestedStages->every(fn($stage) => in_array($stage, $creationStages, true))) {
            $query->orderBy('leads.created_at', 'desc');
            return;
        }

        $driver = DB::connection()->getDriverName();
        [$dateExpr, $timeExpr] = $this->buildNextActionExtractExpr($driver, 'la');

        $latestActionIds = $this->tenantConnection()->table('lead_actions as la')
            ->selectRaw('MAX(la.id) as id, la.lead_id')
            ->when(!$this->isAdminUser($user), function ($q) use ($driver) {
                // Exclude manager-only actions from ordering for non-admins.
                // Keep in sync with the visibility logic used when eager-loading latestAction.
                $q->whereRaw($this->buildActionVisibilityWhere($driver, 'la'));
            })
            ->groupBy('la.lead_id');

        $query->leftJoinSub($latestActionIds, 'la_latest', function ($join) {
            $join->on('la_latest.lead_id', '=', 'leads.id');
        });
        $query->leftJoin('lead_actions as la', 'la.id', '=', 'la_latest.id');

        $query->orderByRaw("CASE WHEN {$dateExpr} IS NULL THEN 1 ELSE 0 END asc");
        $query->orderByRaw("{$dateExpr} desc");
        $query->orderByRaw("COALESCE({$timeExpr}, '') desc");
        $query->orderBy('leads.created_at', 'desc');
    }

    private function isAdminUser($user): bool
    {
        $roleLower = strtolower($user->role ?? '');
        $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();

        return str_contains($roleLower, 'admin')
            || in_array('admin', $roles, true)
            || in_array('tenant admin', $roles, true)
            || !empty($user->is_super_admin);
    }

    private function applyNextActionDateOrdering($query, $user): void
    {
        $driver = DB::connection()->getDriverName();

        $latestActionIds = $this->tenantConnection()->table('lead_actions as la')
            ->selectRaw('MAX(la.id) as id, la.lead_id')
            ->when(!$this->isAdminUser($user), function ($q) use ($driver) {
                // Exclude manager-only actions from ordering for non-admins.
                // Keep in sync with the visibility logic used when eager-loading latestAction.
                $q->whereRaw($this->buildActionVisibilityWhere($driver, 'la'));
            })
            ->groupBy('la.lead_id');

        $query->leftJoinSub($latestActionIds, 'la_latest', function ($join) {
            $join->on('la_latest.lead_id', '=', 'leads.id');
        });
        $query->leftJoin('lead_actions as la', 'la.id', '=', 'la_latest.id');

        [$dateExpr, $timeExpr] = $this->buildNextActionExtractExpr($driver, 'la');

        // Null/empty next action date => push to bottom
        $query->orderByRaw("CASE WHEN {$dateExpr} IS NULL THEN 1 ELSE 0 END asc");
        $query->orderByRaw("{$dateExpr} asc");
        $query->orderByRaw("COALESCE({$timeExpr}, '') asc");
        $query->orderBy('leads.created_at', 'desc');
    }

    private function buildActionVisibilityWhere(string $driver, string $alias): string
    {
        // Returns a predicate that evaluates to TRUE when the action is visible (not manager-only).
        switch ($driver) {
            case 'pgsql':
                return "COALESCE({$alias}.details->>'visibility', '') <> 'manager'";
            case 'sqlite':
                return "COALESCE(json_extract({$alias}.details, '$.visibility'), '') <> 'manager'";
            case 'sqlsrv':
                return "COALESCE(JSON_VALUE({$alias}.details, '$.visibility'), '') <> 'manager'";
            case 'mysql':
            default:
                $vis = "JSON_UNQUOTE(JSON_EXTRACT({$alias}.details, '$.visibility'))";
                return "COALESCE({$vis}, '') <> 'manager'";
        }
    }

    /**
     * Builds SQL expressions to extract next action date/time from lead_actions.details JSON.
     *
     * Returns [dateExpr, timeExpr] where dateExpr is normalized to YYYY-MM-DD and NULL if missing/empty.
     */
    private function buildNextActionExtractExpr(string $driver, string $alias): array
    {
        switch ($driver) {
            case 'pgsql': {
                $date = "NULLIF(substring(COALESCE({$alias}.details->>'date', ''), 1, 10), '')";
                $time = "NULLIF(COALESCE({$alias}.details->>'time', ''), '')";
                return [$date, $time];
            }
            case 'sqlite': {
                $date = "NULLIF(substr(COALESCE(json_extract({$alias}.details, '$.date'), ''), 1, 10), '')";
                $time = "NULLIF(COALESCE(json_extract({$alias}.details, '$.time'), ''), '')";
                return [$date, $time];
            }
            case 'sqlsrv': {
                $date = "NULLIF(LEFT(COALESCE(JSON_VALUE({$alias}.details, '$.date'), ''), 10), '')";
                $time = "NULLIF(COALESCE(JSON_VALUE({$alias}.details, '$.time'), ''), '')";
                return [$date, $time];
            }
            case 'mysql':
            default: {
                $date = "NULLIF(LEFT(COALESCE(JSON_UNQUOTE(JSON_EXTRACT({$alias}.details, '$.date')), ''), 10), '')";
                $time = "NULLIF(COALESCE(JSON_UNQUOTE(JSON_EXTRACT({$alias}.details, '$.time')), ''), '')";
                return [$date, $time];
            }
        }
    }

    public function stats(Request $request)
    {
        try {
            $user = $request->user();
            // Include duplicates here so we can compute duplicate counts separately,
            // while Total Leads and byStage will still exclude them per business rule.
            $query = $this->buildFilteredLeadsQuery($request, $user, true);

            $stageVisibility = $this->resolveLeadStageVisibilityContext($request, $user);
            $displayStageSql = $this->buildLeadDisplayStageSql($stageVisibility);
                
                // Business rule: Duplicate leads should not be counted in Total Leads or pipeline stages.
                // Important: use COALESCE to avoid NULL tri-state logic (NOT(NULL) => NULL => filters out everything).
                $dupPredicate = "(COALESCE(lower(status), '') = 'duplicate' OR COALESCE(lower(stage), '') = 'duplicate')";
                $nonDupQuery = (clone $query)->whereRaw("NOT ($dupPredicate)");
                $dupQuery = (clone $query)->whereRaw($dupPredicate);

                $duplicateCount = (int) (clone $dupQuery)->count();

                $byStage = (clone $nonDupQuery)->select(DB::raw("{$displayStageSql} as display_stage"), DB::raw('count(*) as count'))
                    ->groupBy('display_stage')
                    ->get()
                    ->pluck('count', 'display_stage');

                $normalizedByStage = [];
                foreach ($byStage as $stageKey => $stageCount) {
                    $normalizedByStage[strtolower(trim((string) $stageKey))] = (int) $stageCount;
                }

                // Total Leads = sum of pipeline stage buckets (duplicates already excluded via $nonDupQuery).
                $totalFromByStage = 0;
                try {
                    foreach ($byStage as $stageKey => $stageCount) {
                        $key = strtolower(trim((string) $stageKey));
                        if ($key === '') {
                            continue;
                        }
                        $totalFromByStage += (int) $stageCount;
                    }
                } catch (\Throwable $e) {
                    $totalFromByStage = (int) ($counts->total ?? 0);
                }
                $newFromByStage = ($normalizedByStage['new lead'] ?? 0) + ($normalizedByStage['new'] ?? 0);
                $pendingFromByStage = $normalizedByStage['pending'] ?? 0;
                $coldCallsFromByStage =
                    ($normalizedByStage['cold calls'] ?? 0)
                    + ($normalizedByStage['coldcalls'] ?? 0)
                    + ($normalizedByStage['cold call'] ?? 0)
                    + ($normalizedByStage['cold-call'] ?? 0)
                    + ($normalizedByStage['cold_call'] ?? 0)
                    + ($normalizedByStage['cold_calls'] ?? 0);
                // Hot is a priority flag, not a pipeline stage.
                $hotCount = (int) (clone $nonDupQuery)
                    ->whereRaw("lower(COALESCE(priority,'')) = 'hot'")
                    ->count();

                // Closed Deals count (exclude duplicates) - matches pipeline report predicate.
                $closedDealsCount = (int) (clone $nonDupQuery)->whereRaw("
                    (
                        lower(coalesce(stage,'')) like '%closing%' OR
                        lower(coalesce(stage,'')) like '%closed%' OR
                        lower(coalesce(stage,'')) like '%إغلاق%' OR
                        lower(coalesce(status,'')) in ('converted','won','فوز')
                    )
                ")->count();

                $distinctAgencies = $this->distinctMetaDataTextValues($query, 'agency', 'agency', 'leads.meta_data');

            $data = [
                'total' => $totalFromByStage,
                'new' => $newFromByStage,
                'pending' => $pendingFromByStage,
                'coldCall' => $coldCallsFromByStage,
                'duplicate' => $duplicateCount,
                'closedDeals' => $closedDealsCount,
                'hotCount' => (int) $hotCount,
                'byStage' => $byStage,
                'agencies' => $distinctAgencies,
            ];

            return response()->json($data);

        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Leads Stats Error: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to fetch stats', 'error' => $e->getMessage()], 500);
        }
    }

    public function analysis(Request $request)
    {
        try {
            $user = $request->user();

            // Keep analysis filters in sync with Leads index/stats logic (supports assigned_to by id or name).
            $query = $this->buildFilteredLeadsQuery($request, $user);

            // Exclude referral leads (kept for analysis semantics).
            $query->whereDoesntHave('referralUsers');

            if (!$request->filled('created_from') && !$request->filled('created_to')) {
                $query->whereYear('leads.created_at', now()->year);
            }

            // Clone query for different aggregations
            $monthlyQuery = clone $query;
            $sourceQuery = clone $query;
            $statusQuery = clone $query;

            // 1. Monthly for the requested date range
            $monthly = $monthlyQuery->selectRaw('DATE_FORMAT(created_at, "%Y-%m") as month, DATE_FORMAT(created_at, "%M") as label, count(*) as value, sum(estimated_value) as revenue')
                ->selectRaw('sum(case when status="converted" then 1 else 0 end) as converted')
                ->selectRaw('sum(case when status="lost" then 1 else 0 end) as lost')
                ->selectRaw('sum(case when status not in ("converted", "lost") then 1 else 0 end) as inProgress')
                ->groupBy('month', 'label')
                ->orderBy('month', 'asc')
                ->get()
                ->values();

            // 2. By Source
            $bySource = $sourceQuery->select('source', DB::raw('count(*) as count'))
                ->groupBy('source')
                ->orderByDesc('count')
                ->limit(10)
                ->get();

            // 3. By Status
            $byStatus = $statusQuery->select('status', DB::raw('count(*) as count'))
                ->groupBy('status')
                ->orderByDesc('count')
                ->get();

            return response()->json([
                'monthly' => $monthly,
                'bySource' => $bySource,
                'byStatus' => $byStatus
            ]);

        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Leads Analysis Error: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to fetch analysis',
                'error' => $e->getMessage(),
                'monthly' => [],
                'bySource' => [],
                'byStatus' => []
            ], 500);
        }
    }

    public function pipelineAnalysis(Request $request)
    {
        $user = $request->user();
        $query = Lead::query();

        if (!$user->is_super_admin) {
            $query->where('tenant_id', $user->tenant_id);
        }

        // Exclude referral leads
        $query->whereDoesntHave('referralUsers');

        $requestedManagerId = null;
        if ($request->filled('manager_id') && is_numeric($request->manager_id)) {
            $requestedManagerId = (int) $request->manager_id;
        }

        $viewableIds = $this->getViewableUserIds($user, $requestedManagerId);
        if ($viewableIds !== null) {
            $query->whereIn('assigned_to', $viewableIds);
        }

        // Business rule: Duplicate leads should not be counted in pipeline reporting.
        // Important: use COALESCE to avoid NULL tri-state logic (NOT(NULL) => NULL => filters out everything).
        $dupPredicate = "(COALESCE(lower(status), '') = 'duplicate' OR COALESCE(lower(stage), '') = 'duplicate')";
        $query->whereRaw("NOT ($dupPredicate)");
        
        // Apply Date Filters
        if ($request->has('created_from') && !empty($request->created_from)) {
            $query->whereDate('created_at', '>=', $request->created_from);
        }
        if ($request->has('created_to') && !empty($request->created_to)) {
            $query->whereDate('created_at', '<=', $request->created_to);
        }

        // --- Apply Advanced Filters (Synced with index/stats) ---

        // Filter by Created By
        if ($request->has('created_by') && !empty($request->created_by)) {
            $createdBys = (array)$request->created_by;
            $query->whereIn('created_by', $createdBys);
        }

        // Filter by Assigned User (Specific filter from frontend)
            if ($request->has('assigned_to') && !empty($request->assigned_to)) {
                 $assignedTos = $request->assigned_to;
                 
                 // Handle array or single value
                 if (!is_array($assignedTos)) {
                     $assignedTos = [$assignedTos];
                 }
                 
                 $ids = [];
                 $names = [];
                 
                 foreach ($assignedTos as $val) {
                     if (is_numeric($val)) {
                         $ids[] = $val;
                     } else {
                         $names[] = $val;
                     }
                 }
                 
                 $query->where(function($q) use ($ids, $names) {
                     if (!empty($ids)) {
                         $q->whereIn('assigned_to', $ids);
                     }
                     if (!empty($names)) {
                         $q->orWhereHas('assignedAgent', function($sq) use ($names) {
                             $sq->whereIn('name', $names);
                         });
                     }
                 });
            }

        // Filter by Source
        if ($request->has('source') && !empty($request->source)) {
            $sources = (array)$request->source;
            $query->whereIn('source', $sources);
        }

        // Filter by Priority
        if ($request->has('priority') && !empty($request->priority)) {
            $priorities = (array)$request->priority;
            $query->whereIn('priority', $priorities);
        }

        // Filter by Campaign
        if ($request->has('campaign') && !empty($request->campaign)) {
            $campaigns = (array)$request->campaign;
            $query->whereIn('campaign', $campaigns);
        }

        // Filter by Search
        if ($request->has('search') && !empty($request->search)) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhere('company', 'like', "%{$search}%")
                  ->orWhere('stage', 'like', "%{$search}%")
                  ->orWhere('location', 'like', "%{$search}%")
                  ->orWhere('notes', 'like', "%{$search}%")
                  ->orWhereHas('assignedAgent', function($subQ) use ($search) {
                      $subQ->where('name', 'like', "%{$search}%");
                  });
            });
        }

        // Clone for different views
        $stageQuery = clone $query;
        $trendQuery = clone $query;
        $rawQuery = clone $query;

        $currentUserId = $user->id;
        $viewType = $request->get('view_type', 'all_leads');
        $isManager = !in_array(strtolower($user->role ?? ''), ['sales person', 'salesperson']);
        $isAllLeadsView = $viewType === 'all_leads';

        // Keep stage bucketing consistent with /api/leads/stats (virtual "pending" stage rules).
        $noActionAfterResetSql = $this->buildLeadNoActionAfterResetSql('leads');
        $displayStageSql = "
            CASE 
                WHEN " . ($isAllLeadsView && $isManager ? "1" : "0") . " = 1 AND assigned_to = $currentUserId AND (lower(stage) = 'new' or lower(stage) = 'new lead' or (lower(status) = 'new' and stage is null)) AND {$noActionAfterResetSql} THEN 'pending'
                WHEN (lower(stage) = 'new' or lower(stage) = 'new lead' or (lower(status) = 'new' and stage is null)) AND COALESCE(assigned_to, 0) > 0 AND assigned_to != $currentUserId AND {$noActionAfterResetSql} THEN 'pending'
                WHEN (lower(stage) in ('coldcalls','cold calls','cold-call','cold_call','cold_calls','cold call')) AND COALESCE(assigned_to, 0) > 0 AND (assigned_to != $currentUserId OR " . ($isAllLeadsView && $isManager ? "1" : "0") . " = 1) AND {$noActionAfterResetSql} THEN 'pending'
                ELSE stage
            END
        ";

        // 1. Value by Stage
        $byStage = $stageQuery->select(DB::raw("$displayStageSql as stage_name"), DB::raw('sum(estimated_value) as value'), DB::raw('count(*) as count'))
            ->groupBy('stage_name')
            ->get()
            ->map(function($item) {
                return [
                    'stage' => $item->stage_name,
                    'value' => $item->value,
                    'count' => $item->count
                ];
            });

        // 2. Trend (Value over time - Daily for last 30 days)
        $trend = $trendQuery->selectRaw('DATE(created_at) as date, sum(estimated_value) as value')
            ->whereDate('created_at', '>=', now()->subDays(30))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        // 3. Raw Data (for Pivot/List views)
        $rawData = $rawQuery->with('assignedAgent:id,name')
            ->select('id', 'created_at', 'name as leadName', 'assigned_to', DB::raw("$displayStageSql as stage"), 'estimated_value as value')
            ->latest()
            ->limit(1000)
            ->get()
            ->map(function($lead) {
                return [
                    'date' => $lead->created_at->format('Y-m-d'),
                    'employee' => $lead->assignedAgent ? $lead->assignedAgent->name : 'Unassigned',
                    'leadName' => $lead->leadName,
                    'stage' => $lead->stage,
                    'value' => (float) $lead->value,
                    'prorated' => (float) $lead->value // Assuming 100% for now, or calculate based on probability
                ];
            });

        return response()->json([
            'byStage' => $byStage,
            'trend' => $trend,
            'raw_data' => $rawData
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        // 1. Validate Standard Fields
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:255',
            'company' => 'nullable|string|max:255',
            'campaign' => 'nullable|string|max:255',
            'country' => 'nullable|string|max:255',
            // ... add other standard validations as needed
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // 2. Validate Custom Fields
        $entity = Entity::where('key', 'leads')->first();
        if ($entity) {
            $customFields = $entity->fields;
            $customRules = [];
            
            foreach ($customFields as $field) {
                if ($field->required && $field->active) {
                    $customRules['custom_fields.' . $field->key] = 'required';
                }
            }
            
            if (!empty($customRules)) {
                $customValidator = Validator::make($request->all(), $customRules);
                if ($customValidator->fails()) {
                     return response()->json(['errors' => $customValidator->errors()], 422);
                }
            }
        }

        try {
            DB::beginTransaction();

            // Handle Attachments
            $data = $request->except('custom_fields', 'attachments');
            $phoneCountryHint = $request->input('phone_country');
            if (array_key_exists('phone_country', $data)) {
                unset($data['phone_country']);
            }

            $tenantId = $request->user()?->tenant_id;
            /** @var TelesalesService $telesalesService */
            $telesalesService = app(TelesalesService::class);
            $sourceInput = trim((string) ($data['source'] ?? ''));
            if ($sourceInput !== '') {
                $resolvedSourceName = TenantSourceLookup::resolveName($tenantId, $sourceInput);
                if (!$resolvedSourceName) {
                    return response()->json([
                        'errors' => [
                            'source' => ['Selected source does not exist for this tenant.'],
                        ],
                    ], 422);
                }

                $data['source'] = $resolvedSourceName;
            }

            $workflowKey = $telesalesService->resolveInitialWorkflow($request->user(), $data);
            $data['workflow_key'] = $workflowKey;
            $data['workflow_entered_at'] = now();

            if ($workflowKey === TelesalesService::WORKFLOW_TELESALES && !empty($data['assigned_to'])) {
                try {
                    $validatedAssignee = $telesalesService->validateTelesalesAssigneeId((int) $tenantId, (int) $data['assigned_to']);

                    if ($validatedAssignee) {
                        $data['assigned_to'] = $validatedAssignee->id;
                        $data['sales_person'] = $validatedAssignee->name;
                    }
                } catch (\InvalidArgumentException $e) {
                    return response()->json([
                        'errors' => [
                            'assigned_to' => [$e->getMessage()],
                        ],
                    ], 422);
                }
            }

            $requestedStageId = !empty($data['stage_id']) ? (int) $data['stage_id'] : null;
            $resolvedStageId = $telesalesService->resolveEntryStageId($tenantId, $workflowKey, $requestedStageId);
            if (!$resolvedStageId) {
                return response()->json([
                    'errors' => [
                        'stage_id' => ['No active stage is configured for the selected workflow.'],
                    ],
                ], 422);
            }

            $resolvedStageModel = Stage::find($resolvedStageId);
            if (!$resolvedStageModel) {
                return response()->json([
                    'errors' => [
                        'stage_id' => ['Selected stage is not allowed for this tenant.'],
                    ],
                ], 422);
            }
            $data['stage_id'] = $resolvedStageId;
            $data['stage'] = trim((string) $resolvedStageModel->name);

            // Normalize phone for consistent search/duplicate matching
            $rawPhone = isset($data['phone']) ? trim((string) $data['phone']) : '';
            if ($rawPhone !== '') {
                $data['phone'] = PhoneNormalizer::normalize($rawPhone, $phoneCountryHint);
            }
            
            // Sanitize numeric fields
            if (isset($data['estimated_value']) && $data['estimated_value'] === '') {
                $data['estimated_value'] = null;
            }

            // Set Created By
            $data['created_by'] = $request->user()->id;

            if ($request->hasFile('attachments')) {
                $paths = [];
                $files = $request->file('attachments');
                // Ensure it's an array
                if (!is_array($files)) {
                    $files = [$files];
                }
                foreach ($files as $file) {
                    $paths[] = $file->store('leads/attachments', 'public');
                }
                $data['attachments'] = $paths;
            }

            // 3. Create Lead
            $crm = CrmSetting::first();
            $enableDup = is_array($crm?->settings) ? (bool)($crm->settings['duplicationSystem'] ?? false) : false;
            $variantsForSearch = null;
            
            if ($enableDup) {
                $isDuplicate = false;
                $duplicateOfId = null;
                $workflowKey = strtolower(trim((string) ($data['workflow_key'] ?? '')));
                if (!empty($data['phone']) && $rawPhone !== '') {
                    $variants = PhoneNormalizer::variantsForSearch($rawPhone, $phoneCountryHint);
                    $variants = !empty($variants) ? $variants : [$data['phone']];
                    $variantsForSearch = $variants;
                    $base = Lead::query();
                    $this->applyDuplicateWorkflowScope($base, $tenantId, $workflowKey);
                    $isDuplicate = (clone $base)
                        ->whereIn('phone', $variants)
                        ->where(function ($q) { $q->whereNull('is_duplicate_exception')->orWhere('is_duplicate_exception', false); })
                        ->exists();

                    if ($isDuplicate) {
                        $original = (clone $base)->whereIn('phone', $variants)
                            ->where(function ($q) {
                                $q->whereNull('status')->orWhere('status', '!=', 'duplicate');
                            })
                            ->where(function ($q) { $q->whereNull('is_duplicate_exception')->orWhere('is_duplicate_exception', false); })
                            ->orderBy('id', 'asc')
                            ->first();
                        if (!$original) {
                            $original = (clone $base)->whereIn('phone', $variants)->orderBy('id', 'asc')->first();
                        }
                        $duplicateOfId = $this->resolveDuplicateRootId($original, $tenantId);
                    }
                }
                
                if ($isDuplicate) {
                    $enteredStage = $this->sanitizeDuplicateEnteredStage($data['stage'] ?? null);
                    $meta = is_array($data['meta_data'] ?? null) ? ($data['meta_data'] ?? []) : [];
                    if ($enteredStage !== null) {
                        $meta['entered_stage'] = $enteredStage;
                    }
                    $data['meta_data'] = $meta;

                    $data['status'] = 'duplicate';
                    $data['stage'] = 'Duplicate'; // Override stage if duplicate
                }
            }

            // Keep phone country in meta_data (do not depend on a DB column existing)
            if ($phoneCountryHint) {
                $meta = is_array($data['meta_data'] ?? null) ? ($data['meta_data'] ?? []) : [];
                $meta['phone_country'] = $phoneCountryHint;
                $data['meta_data'] = $meta;
            }

            if ($request->user()?->isAgencyScopedMarketingUser() && filled($request->user()?->agency_id)) {
                $meta = is_array($data['meta_data'] ?? null) ? ($data['meta_data'] ?? []) : [];
                $meta['agency_id'] = (string) $request->user()->agency_id;
                $data['meta_data'] = $meta;
            }

            if (!empty($duplicateOfId)) {
                $meta = is_array($data['meta_data'] ?? null) ? ($data['meta_data'] ?? []) : [];
                $meta['duplicate_of'] = $duplicateOfId;
                $data['meta_data'] = $meta;
            }

            // If this is a duplicate attempt and an active duplicate record already exists for this phone,
            // update that record instead of creating a new duplicate lead.
            if ($enableDup && !empty($duplicateOfId) && (strtolower((string)($data['status'] ?? '')) === 'duplicate' || strtolower((string)($data['stage'] ?? '')) === 'duplicate')) {
                $variants = is_array($variantsForSearch) && !empty($variantsForSearch) ? $variantsForSearch : (isset($data['phone']) ? [$data['phone']] : []);
                $existingDup = $this->findActiveDuplicateLead($tenantId, $variants, (int) $duplicateOfId);
                if ($existingDup) {
                    $meta = is_array($data['meta_data'] ?? null) ? ($data['meta_data'] ?? []) : [];
                    $attempt = $this->buildDuplicateAttemptMeta($request->user(), $data, $meta, 'manual_create');
                    $meta = $this->bumpDuplicateAttemptMeta($meta, $attempt);
                    $data['meta_data'] = $meta;

                    $update = $data;
                    unset($update['tenant_id'], $update['created_by']);

                    if (isset($update['attachments']) && is_array($update['attachments'])) {
                        $existingAttachments = is_array($existingDup->attachments ?? null) ? ($existingDup->attachments ?? []) : [];
                        $merged = array_values(array_unique(array_merge($existingAttachments, $update['attachments'])));
                        $update['attachments'] = $merged;
                    }

                    $existingDup->fill($update);
                    $existingDup->save();

                    DB::commit();
                    return response()->json($existingDup->load(['creator:id,name', 'assignedAgent:id,name']), 200);
                }
            }

            // New duplicate record (first time for this phone): seed attempts meta.
            if ($enableDup && (strtolower((string)($data['status'] ?? '')) === 'duplicate' || strtolower((string)($data['stage'] ?? '')) === 'duplicate')) {
                $meta = is_array($data['meta_data'] ?? null) ? ($data['meta_data'] ?? []) : [];
                $attempt = $this->buildDuplicateAttemptMeta($request->user(), $data, $meta, 'manual_create');
                $meta = $this->bumpDuplicateAttemptMeta($meta, $attempt);
                $data['meta_data'] = $meta;
            }
            $lead = Lead::create($data);

            $telesalesService->appendWorkflowHistory($lead, $request->user(), [
                'from_workflow' => null,
                'to_workflow' => $workflowKey,
                'from_stage_id' => null,
                'to_stage_id' => $lead->stage_id,
                'action' => 'lead_created',
                'meta_data' => [
                    'source' => $lead->source,
                    'created_via' => 'lead_store',
                ],
            ]);

            // Notify privileged roles when a duplicate lead is detected (stored inside leads table).
            // This keeps the "management review" workflow consistent.
            try {
                if ($enableDup && (strtolower((string)($lead->status ?? '')) === 'duplicate' || strtolower((string)($lead->stage ?? '')) === 'duplicate') && !empty($duplicateOfId)) {
                    $originalLead = Lead::find($duplicateOfId);
                    if ($originalLead) {
                        $tenantId = $request->user()?->tenant_id;
                        $recipients = $this->getDuplicateNotificationRecipients($tenantId);
                        $notification = new \App\Notifications\DuplicateLeadWarning($lead, $originalLead);
                        foreach ($recipients as $userRecipient) {
                            try {
                                $userRecipient->notify($notification);
                            } catch (\Throwable $e) {
                            }
                        }
                    }
                }
            } catch (\Throwable $e) {
            }

            // 4. Save Custom Fields
            if ($request->has('custom_fields') && $entity) {
                $fieldsMap = $entity->fields->pluck('id', 'key'); // key => id map
                
                foreach ($request->input('custom_fields') as $key => $value) {
                    if (isset($fieldsMap[$key])) {
                        FieldValue::create([
                            'field_id' => $fieldsMap[$key],
                            'record_id' => $lead->id,
                            'value' => $value,
                        ]);
                    }
                }
            }

            // Logic 1: New lead automatically appears in "New Lead" for creator
            // Already handled by default stage = 'new' if not provided, and assigned_to/created_by logic.
            // If creator assigns to self, it's New Lead.
            // If creator assigns to someone else, check Logic 2.
            
            // Logic 2 & 4: Assignment logic on creation
            if (!empty($data['assigned_to'])) {
                 $assignee = User::find($data['assigned_to']);
                 $this->ensureUserCanBeAssignedLeadSource($assignee, $data['source'] ?? $lead->source ?? null);
                 $this->ensureUserCanBeAssignedLeadProject($assignee, $this->resolveLeadProjectLabel($lead, $data['project'] ?? null, $data['project_id'] ?? null));
                 $assigneeId = $data['assigned_to'];
                 $creatorId = $request->user()->id;
                 
                 // If assigned to self -> New Lead (default)
                 
                 // If assigned to another person (Sales Person)
                 if ($assigneeId != $creatorId) {
                      // It should be 'New Lead' for Sales Person (default stage='new')
                      // But 'Pending' for Manager (Creator)
                      
                      // We need to set manager_id to creator if not set
                      if (empty($data['manager_id'])) {
                           $lead->manager_id = $creatorId;
                           $lead->save();
                      }
                 }
            } else {
                $creatorIsSalesPerson = false;
                try {
                    $actor = $request->user();
                    if ($actor && empty($lead->assigned_to)) {
                        $roles = method_exists($actor, 'getRoleNames')
                            ? $actor->getRoleNames()->map(fn($r) => strtolower((string) $r))->toArray()
                            : [];
                        $roleLower = strtolower((string) ($actor->role ?? ''));
                        $isSalesPerson = str_contains($roleLower, 'sales person')
                            || str_contains($roleLower, 'salesperson')
                            || in_array('sales person', $roles, true)
                            || in_array('salesperson', $roles, true);
                        $creatorIsSalesPerson = $isSalesPerson;

                        if ($isSalesPerson) {
                            $lead->assigned_to = $actor->id;
                            $lead->sales_person = $actor->name;
                            if (empty($lead->manager_id) && !empty($actor->manager_id)) {
                                $lead->manager_id = $actor->manager_id;
                            }
                            $lead->save();
                        }
                    }
                } catch (\Throwable $e) {
                }
                try {
                    $actor = $request->user();
                    $tenantId = (int) ($actor?->tenant_id ?? 0);
                    if ($tenantId && empty($lead->assigned_to) && !$creatorIsSalesPerson) {
                        $engine = app(LeadRotationEngine::class);
                        if ($engine->isNewLeadStage($lead)) {
                            $settings = $engine->getSettings($tenantId);
                            if ($settings->allow_assign_rotation && $engine->isWithinWindow((string) $settings->work_from, (string) $settings->work_to, now())) {
                                $filters = $engine->resolveLeadFilters($lead, $tenantId);
                                $queueKey = $engine->buildQueueKey($lead, $filters);
                                $eligible = $engine->getEligibleAssignUserIds($tenantId, $filters);
                                $next = $engine->pickNextUserId($tenantId, $queueKey, $eligible);
                                if ($next) {
                                    $engine->assignLeadToUser($lead, $next);
                                }
                            }
                        }
                    }
                } catch (\Throwable $e) {
                }
            }

            DB::commit();

            if ($lead->assigned_to) {
                $assignee = User::with(['manager', 'team.leader'])->find($lead->assigned_to);
                $actor = $request->user();
                if ($assignee && $actor) {
                    $notification = new \App\Notifications\LeadAssigned($lead, $actor->name);
                    $recipients = $this->buildNotificationRecipients(
                        $assignee,
                        [
                            'owner' => $lead->creator,
                            'assignee' => $assignee,
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

            // Notify when a Sales Person creates a lead (self + managers)
            try {
                $actor = $request->user();
                if ($actor) {
                    $roles = method_exists($actor, 'getRoleNames') ? $actor->getRoleNames()->map(fn($r) => strtolower((string)$r))->toArray() : [];
                    $roleLower = strtolower((string)($actor->role ?? ''));
                    $isSalesPerson = str_contains($roleLower, 'sales person')
                        || str_contains($roleLower, 'salesperson')
                        || in_array('sales person', $roles)
                        || in_array('salesperson', $roles);

                    if ($isSalesPerson) {
                        $actor->loadMissing(['manager', 'team.leader']);
                        $recipients = [];
                        $recipients[$actor->id] = $actor;
                        if ($actor->manager) {
                            $recipients[$actor->manager->id] = $actor->manager;
                        }
                        $teamLeader = $actor->team?->leader ?? null;
                        if ($teamLeader) {
                            $recipients[$teamLeader->id] = $teamLeader;
                        }

                        $leadFresh = $lead->fresh(['assignedAgent:id,name', 'creator:id,name']);
                        $notification = new \App\Notifications\LeadCreated($leadFresh, $actor->name);
                        foreach (array_values($recipients) as $recipient) {
                            try {
                                $recipient->notify($notification);
                            } catch (\Throwable $e) {
                            }
                        }
                    }
                }
            } catch (\Throwable $e) {
            }

            return response()->json($lead->load(['customFieldValues.field', 'creator:id,name', 'assignedAgent:id,name']), 201);

        } catch (\Exception $e) {
            DB::rollBack();
            \Illuminate\Support\Facades\Log::error('Lead Store Error: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to create lead', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        /** @var \App\Models\User|null $user */
        $user = Auth::user();
        \Illuminate\Support\Facades\Log::info("LeadController@show hit for Lead ID: $id. User Tenant: " . (Auth::check() ? $user->tenant_id : 'guest'));

        $lead = Lead::findOrFail($id);

        if (!$this->canViewLead($user, $lead)) {
            abort(403, 'Unauthorized to view this lead');
        }

        $lead->load([
            'customFieldValues.field', 
            'assignedAgent:id,name', 
            'creator:id,name',
            'actions' => function($query) use ($user) {
                $query->with('creator:id,name');
                
                // Hide actions marked as manager-only for non-admins
                $roleLower = strtolower($user->role ?? '');
                $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();
                
                // Only Admin or Super Admin can see manager-only history
                $isAdmin = str_contains($roleLower, 'admin') || 
                           in_array('admin', $roles) || 
                           in_array('tenant admin', $roles) ||
                           $user->is_super_admin;
                
                if (!$isAdmin) {
                    $query->where(function($q) {
                        $q->whereNull('details->visibility')
                          ->orWhere('details->visibility', '!=', 'manager');
                    });
                }
            }
        ]);
        
        \Illuminate\Support\Facades\Log::info("Lead loaded. Actions count: " . $lead->actions->count());
        
        // Guard duplicate visibility if duplication system enabled
        $crm = \App\Models\CrmSetting::first();
        $enableDup = is_array($crm?->settings) ? (bool)($crm->settings['duplicationSystem'] ?? false) : false;
        if ($enableDup && (strtolower($lead->status ?? '') === 'duplicate' || strtolower($lead->stage ?? '') === 'duplicate')) {
            if (!$this->canViewDuplicates($user)) {
                abort(403, 'Unauthorized to view duplicate leads');
            }
        }

        // Append permissions
        $isReferral = $this->isReferralSupervisor($user, $lead);
        $permissions = [
            'can_edit' => $user->can('update', $lead) && !$isReferral,
            'can_delete' => $user->can('delete', $lead) && !$isReferral,
            'can_add_action' => $this->canAddActionToLead($user, $lead),
            'is_referral_supervisor' => $isReferral,
        ];
        $lead->permissions = $permissions;
        $this->appendLeadDisplayLabels($lead);

        return response()->json($lead);
    }

    public function delayed(Request $request)
    {
        try {
            $user = $request->user();
            $query = Lead::query();

            $workflowFilter = strtolower(trim((string) $request->input('workflow_key', '')));
            if (!in_array($workflowFilter, [TelesalesService::WORKFLOW_SALES, TelesalesService::WORKFLOW_TELESALES], true)) {
                $workflowFilter = TelesalesService::WORKFLOW_SALES;
            }
            $query->where('workflow_key', $workflowFilter);

            // Exclude referral leads
            $query->whereDoesntHave('referralUsers');
            
            // 1. Filter by User Permissions (Viewable)
            $viewableIds = $this->getViewableUserIds($user);
            if ($viewableIds !== null) {
                $query->where(function ($q) use ($viewableIds, $user) {
                    $q->whereIn('assigned_to', $viewableIds)
                      ->orWhere('manager_id', $user->id);
                });
            }

            // Hide duplicates from non-privileged users when duplication system enabled
            // EXCEPT if the lead is assigned to them directly
            $crm = \App\Models\CrmSetting::first();
            $enableDup = is_array($crm?->settings) ? (bool)($crm->settings['duplicationSystem'] ?? false) : false;
            
            if ($enableDup && !$this->canViewDuplicates($user)) {
                $query->where(function($q) use ($user) {
                    // Show if assigned to me OR NOT a duplicate
                    $q->where('assigned_to', $user->id)
                      ->orWhere(function($sub) {
                        $sub->where(function($s) {
                            $s->whereNull('status')->orWhere('status', '!=', 'duplicate');
                        })->where(function($st) {
                            $st->whereNull('stage')->orWhere('stage', '!=', 'duplicate');
                        });
                      });
                });
            }
            
            // 2. Filter by Employee (if requested)
            if ($request->has('assigned_to') && !empty($request->assigned_to)) {
                $query->where('assigned_to', $request->assigned_to);
            }
            
            $now = \Carbon\Carbon::now(config('app.timezone'));
            $eligibleStatuses = ['scheduled', 'Scheduled', 'pending', 'in_progress', 'in-progress', 'in progress'];

            $query->whereHas('actions', function ($q) use ($eligibleStatuses) {
                $q->whereIn('details->status', $eligibleStatuses)
                  ->whereNotIn('action_type', ['closing_deals', 'cancel'])
                  ->whereNotIn('next_action_type', ['closing_deals', 'cancel'])
                  ->whereNotNull('details->date')
                  ->where('details->date', '!=', '');
            });

            $query->with([
                'assignedAgent:id,name',
                'actions' => function ($q) use ($eligibleStatuses) {
                    $q->whereIn('details->status', $eligibleStatuses)
                      ->whereNotIn('action_type', ['closing_deals', 'cancel'])
                      ->whereNotIn('next_action_type', ['closing_deals', 'cancel'])
                      ->whereNotNull('details->date')
                      ->where('details->date', '!=', '')
                      ->orderByDesc('created_at');
                }
            ]);

            $perPage = (int) $request->get('per_page', 20);
            $page = max(1, (int) $request->get('page', 1));

            $candidates = $query->limit(2000)->get();
            $filtered = [];

            foreach ($candidates as $lead) {
                $latest = $lead->actions->first();
                if (!$latest) {
                    continue;
                }

                $details = is_array($latest->details ?? null) ? ($latest->details ?? []) : (json_decode($latest->details, true) ?? []);
                $date = trim((string) ($details['date'] ?? ''));
                $time = trim((string) ($details['time'] ?? ''));
                if ($date === '') {
                    continue;
                }
                if ($time === '') {
                    $time = '00:00';
                }

                try {
                    $scheduled = \Carbon\Carbon::createFromFormat('Y-m-d H:i', $date . ' ' . substr($time, 0, 5), config('app.timezone'));
                } catch (\Throwable $e) {
                    try {
                        $scheduled = \Carbon\Carbon::createFromFormat('Y-m-d H:i:s', $date . ' ' . $time, config('app.timezone'));
                    } catch (\Throwable $ex) {
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
                // Backend is the source of truth for delay ordering:
                // show the latest delayed action first.
                if (($b['scheduled_at'] ?? 0) !== ($a['scheduled_at'] ?? 0)) {
                    return ($b['scheduled_at'] ?? 0) <=> ($a['scheduled_at'] ?? 0);
                }

                if (($b['created_at'] ?? 0) !== ($a['created_at'] ?? 0)) {
                    return ($b['created_at'] ?? 0) <=> ($a['created_at'] ?? 0);
                }

                return ($b['lead_id'] ?? 0) <=> ($a['lead_id'] ?? 0);
            });

            $orderedLeads = array_map(fn ($item) => $item['lead'], $filtered);
            $total = count($orderedLeads);
            $slice = array_slice($orderedLeads, ($page - 1) * $perPage, $perPage);

            return new \Illuminate\Pagination\LengthAwarePaginator(
                $slice,
                $total,
                $perPage,
                $page,
                ['path' => $request->url(), 'query' => $request->query()]
            );

        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Leads Delayed Error: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to fetch delayed leads',
                'error' => $e->getMessage(),
                'data' => []
            ], 500);
        }
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, $id)
    {
        $lead = Lead::findOrFail($id);
        
        // Enterprise Referral Supervision: Block Update
        if ($this->isReferralSupervisor($request->user(), $lead)) {
            abort(403, 'Referral supervisors cannot update leads.');
        }

        $authUser = $request->user();
        if (!$authUser) {
            abort(401, 'Unauthorized');
        }

        $requestKeys = array_keys($request->all());
        $hasPhoneChange = $request->has('phone') || $request->has('phone_country');
        $hasInfoChange = count(array_diff($requestKeys, ['phone', 'phone_country'])) > 0;

        if ($hasInfoChange && !$this->hasLeadModulePermission($authUser, 'editInfo')) {
            abort(403, 'You do not have permission to edit lead info.');
        }

        if ($hasPhoneChange && !$this->hasLeadModulePermission($authUser, 'editPhone')) {
            abort(403, 'You do not have permission to edit lead phone.');
        }

        $oldAssigneeId = $lead->assigned_to;

        // Validation (similar to store, but maybe less strict on required if partial update)
        // For simplicity, assuming full update or handled similarly
        
        try {
            DB::beginTransaction();
            
            $data = $request->except('custom_fields');
            $phoneCountryHint = $request->input('phone_country');
            if (array_key_exists('phone_country', $data)) {
                unset($data['phone_country']);
            }

            $tenantId = $request->user()?->tenant_id;
            if (array_key_exists('stage', $data) || $request->has('stage')) {
                $resolvedStage = LeadStageResolver::resolve($tenantId, $data['stage'] ?? null, true);
                if ($resolvedStage === null) {
                    return response()->json([
                        'errors' => [
                            'stage' => ['Selected stage is not allowed for this tenant.'],
                        ],
                    ], 422);
                }
                $data['stage'] = $resolvedStage;
            }

            $rawPhone = isset($data['phone']) ? trim((string) $data['phone']) : '';
            if ($rawPhone !== '') {
                $phoneSegments = $this->normalizePhoneInputSegments($rawPhone, $phoneCountryHint);
                $data['phone'] = !empty($phoneSegments)
                    ? implode(' / ', $phoneSegments)
                    : PhoneNormalizer::normalize($rawPhone, $phoneCountryHint);
            }
            
            // Check for duplicate leads on update
            $crm = CrmSetting::first();
            $enableDup = is_array($crm?->settings) ? (bool)($crm->settings['duplicationSystem'] ?? false) : false;

            if ($enableDup) {
                $isDuplicate = false;
                $duplicateOfId = null;
                $workflowKey = strtolower(trim((string) ($data['workflow_key'] ?? ($lead->workflow_key ?? ''))));
                if (!empty($data['phone']) && $rawPhone !== '') {
                    $phoneSegments = $this->normalizePhoneInputSegments($rawPhone, $phoneCountryHint);
                    $primaryPhone = $phoneSegments[0] ?? $rawPhone;
                    $variants = PhoneNormalizer::variantsForSearch($primaryPhone, $phoneCountryHint);
                    $variants = !empty($variants) ? $variants : [$data['phone']];
                    $tenantId = $request->user()?->tenant_id;
                    $base = Lead::query();
                    $this->applyDuplicateWorkflowScope($base, $tenantId, $workflowKey);

                    $isDuplicate = $isDuplicate || (clone $base)->whereIn('phone', $variants)
                        ->where('id', '!=', $lead->id)
                        ->exists();

                    if ($isDuplicate) {
                        $original = (clone $base)->whereIn('phone', $variants)
                            ->where('id', '!=', $lead->id)
                            ->where(function ($q) {
                                $q->whereNull('status')->orWhere('status', '!=', 'duplicate');
                            })
                            ->orderBy('id', 'asc')
                            ->first();
                        if (!$original) {
                            $original = (clone $base)->whereIn('phone', $variants)
                                ->where('id', '!=', $lead->id)
                                ->orderBy('id', 'asc')
                                ->first();
                        }
                        $duplicateOfId = $this->resolveDuplicateRootId($original, $tenantId);
                    }
                }
                if ($isDuplicate) {
                    $data['status'] = 'duplicate';
                    $data['stage'] = 'Duplicate';
                }

                // If phone changed and it is no longer a duplicate, clear duplicate flags/link.
                // This avoids showing "duplicate" comparisons for leads whose phone is now unique.
                $phoneWasProvided = array_key_exists('phone', $data) || $request->has('phone');
                if ($phoneWasProvided && !$isDuplicate) {
                    if (strtolower((string) $lead->status) === 'duplicate' && !array_key_exists('status', $data)) {
                        $data['status'] = 'new';
                    }
                    if (strtolower((string) $lead->stage) === 'duplicate' && !array_key_exists('stage', $data)) {
                        $data['stage'] = 'New Lead';
                    }

                    $meta = is_array($lead->meta_data ?? null) ? ($lead->meta_data ?? []) : [];
                    if (array_key_exists('duplicate_of', $meta)) {
                        unset($meta['duplicate_of']);
                        $data['meta_data'] = !empty($meta) ? $meta : null;
                    }
                }
            }
            
            // Map actions to actions_data if present
            if ($request->has('actions')) {
                $data['actions_data'] = $request->input('actions');
                unset($data['actions']);
            }

            // Handle assignment mapping: assigned_to_id -> assigned_to
            if ($request->has('assigned_to_id')) {
                $data['assigned_to'] = $request->input('assigned_to_id');
            }

            // Populate sales_person if assigned_to is being updated
            if (isset($data['assigned_to'])) {
                $user = \App\Models\User::find($data['assigned_to']);
                if ($user) {
                    $this->ensureUserCanBeAssignedLeadSource($user, $data['source'] ?? $lead->source ?? null);
                    $this->ensureUserCanBeAssignedLeadProject($user, $this->resolveLeadProjectLabel($lead, $data['project'] ?? null, $data['project_id'] ?? null));
                    $data['sales_person'] = $user->name;
                }
            } elseif ($request->has('assignedTo')) {
                // Fallback: use the name provided by frontend if ID lookup is skipped/failed but name is present
                $data['sales_person'] = $request->input('assignedTo');
            }

            if ($phoneCountryHint) {
                $meta = is_array($lead->meta_data ?? null) ? ($lead->meta_data ?? []) : [];
                $meta['phone_country'] = $phoneCountryHint;
                $data['meta_data'] = $meta;
            }

            if (!empty($duplicateOfId)) {
                $meta = is_array($data['meta_data'] ?? null) ? ($data['meta_data'] ?? []) : [];
                $meta['duplicate_of'] = $duplicateOfId;
                $data['meta_data'] = $meta;
            }

            $lead->update($data);

            if ($request->has('custom_fields')) {
                $entity = Entity::where('key', 'leads')->first();
                if ($entity) {
                    $fieldsMap = $entity->fields->pluck('id', 'key');

                    foreach ($request->input('custom_fields') as $key => $value) {
                        if (isset($fieldsMap[$key])) {
                            FieldValue::updateOrCreate(
                                [
                                    'field_id' => $fieldsMap[$key],
                                    'record_id' => $lead->id,
                                ],
                                ['value' => $value]
                            );
                        }
                    }
                }
            }
            
            DB::commit();

            if ($lead->assigned_to && $lead->assigned_to != $oldAssigneeId) {
                $assignee = User::with(['manager', 'team.leader'])->find($lead->assigned_to);
                $actor = $request->user();

                if ($assignee && $actor) {
                    $notification = new \App\Notifications\LeadAssigned($lead, $actor->name);
                    $previousOwner = $oldAssigneeId ? User::find($oldAssigneeId) : null;
                    $recipients = $this->buildNotificationRecipients(
                        $assignee,
                        [
                            'owner' => $lead->creator,
                            'assignee' => $assignee,
                            'assigner' => $actor,
                            'previous_owner' => $previousOwner,
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

            return response()->json($lead->load(['customFieldValues.field', 'creator:id,name', 'assignedAgent:id,name']));

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update lead', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Append uploaded attachment files to the lead's attachments array.
     * Stores files on the public disk and persists their paths in DB.
     */
    public function addAttachments(Request $request, $id)
    {
        $lead = Lead::findOrFail($id);

        // Enterprise Referral Supervision: Block Update
        if ($this->isReferralSupervisor($request->user(), $lead)) {
            abort(403, 'Referral supervisors cannot update leads.');
        }

        $authUser = $request->user();
        if (!$authUser) {
            abort(401, 'Unauthorized');
        }

        if (!$this->hasLeadModulePermission($authUser, 'editInfo')) {
            abort(403, 'You do not have permission to edit lead info.');
        }

        $request->validate([
            'attachments' => ['required'],
            'attachments.*' => ['file'],
        ]);

        $files = $request->file('attachments');
        if (!$files) {
            return response()->json(['message' => 'No files uploaded.'], 422);
        }

        if (!is_array($files)) {
            $files = [$files];
        }

        $tenantId = $authUser->tenant_id ?? $lead->tenant_id;
        $storedPaths = [];

        foreach ($files as $file) {
            if (!$file) {
                continue;
            }

            $originalName = $file->getClientOriginalName();
            $baseName = pathinfo($originalName, PATHINFO_FILENAME);
            $extension = $file->getClientOriginalExtension();
            $safeBase = Str::slug($baseName, '_');
            $safeExt = $extension ? ('.' . strtolower($extension)) : '';

            $filename = $safeBase . '_' . time() . '_' . Str::random(6) . $safeExt;
            $folder = "leads/attachments/tenant_{$tenantId}/lead_{$lead->id}";
            $path = $file->storeAs($folder, $filename, 'public');

            if ($path) {
                $storedPaths[] = $path;
            }
        }

        if (empty($storedPaths)) {
            return response()->json(['message' => 'Failed to store uploaded files.'], 500);
        }

        $existing = $lead->attachments;
        if (!is_array($existing)) {
            try {
                $decoded = json_decode((string) $existing, true);
                $existing = is_array($decoded) ? $decoded : [];
            } catch (\Throwable $e) {
                $existing = [];
            }
        }

        $lead->attachments = array_values(array_merge($existing, $storedPaths));
        $lead->save();

        return response()->json($lead->fresh()->load(['customFieldValues.field', 'creator:id,name', 'assignedAgent:id,name']));
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy($id)
    {
        $user = \Illuminate\Support\Facades\Auth::user();
        if (!$this->canDeleteLead($user)) {
             return response()->json(['message' => 'You do not have permission to delete leads.'], 403);
        }

        // استخدام Transaction لضمان سلامة البيانات (إما أن تتم العمليتان معًا أو تفشلا معًا)
        \Illuminate\Support\Facades\DB::transaction(function () use ($id) {
            // 1. جلب بيانات الليد الأصلي
            $lead = Lead::findOrFail($id);

            // Enterprise Referral Supervision: Block Delete
            if ($this->isReferralSupervisor(\Illuminate\Support\Facades\Auth::user(), $lead)) {
                abort(403, 'Referral supervisors cannot delete leads.');
            }

            // 2. إنشاء سجل جديد في جدول Recycle
            \App\Models\RecycleLead::create([
                'original_lead_id' => $lead->id,
                'lead_data' => $lead->toArray(), // تخزين كامل البيانات كـ JSON
                'deleted_by' => \Illuminate\Support\Facades\Auth::id(),
                'deleted_at' => now(),
            ]);

            // 3. حذف الليد نهائيًا من الجدول الأصلي (لأنه تم نقله للأرشيف)
            // ملاحظة: نستخدم forceDelete لأننا احتفظنا بنسخة بالفعل في RecycleLead
            // إذا كنت تفضل إبقاءه SoftDeleted في الجدول الأصلي أيضًا، استبدل forceDelete بـ delete
            $lead->forceDelete();
        });

        return response()->json(['message' => 'Lead moved to recycle bin successfully']);
    }

    public function trashed(Request $request)
    {
        $query = Lead::onlyTrashed()
            ->with(['customFieldValues.field', 'deletedByUser', 'assignedAgent'])
            ->latest('deleted_at');

        if ($request->has('all')) {
            return $query->get();
        }

        return $query->paginate($request->input('per_page', 10));
    }

    public function restore($id)
    {
        $lead = Lead::withTrashed()->findOrFail($id);
        $lead->restore();

        return response()->json(['message' => 'Lead restored successfully']);
    }

    private function _restoreRecycleLead(RecycleLead $recycleLead)
    {
        // 1. استرجاع البيانات الأصلية
        $leadData = $recycleLead->lead_data;
        if (!is_array($leadData)) {
            $leadData = json_decode($leadData, true) ?? [];
        }
        
        // 2. تنظيف البيانات
        unset($leadData['deleted_at']);
        unset($leadData['created_at']); // Let DB handle timestamps
        unset($leadData['updated_at']);
        
        // Force Tenant ID to current context if available
        $tenantId = null;
        if (app()->bound('current_tenant_id')) {
            $tenantId = app('current_tenant_id');
        } elseif (\Illuminate\Support\Facades\Auth::check()) {
            $tenantId = \Illuminate\Support\Facades\Auth::user()->tenant_id;
        }

        if ($tenantId) {
            $leadData['tenant_id'] = $tenantId;
        }
        
        // تصفية البيانات لتشمل فقط الأعمدة الموجودة في جدول leads
        $columns = \Illuminate\Support\Facades\Schema::getColumnListing('leads');
        $validData = \Illuminate\Support\Arr::only($leadData, $columns);
        
        // 3. التحقق من تضارب الـ ID
        if (isset($validData['id'])) {
            $exists = Lead::withTrashed()->where('id', $validData['id'])->exists();
            if ($exists) {
                // إذا كان الـ ID موجوداً، نحذفه لإنشاء ID جديد
                unset($validData['id']);
            }
        }

        // التحقق من صلاحية المستخدم المسند إليه (assigned_to)
        if (isset($validData['assigned_to']) && $validData['assigned_to']) {
            if (!\App\Models\User::where('id', $validData['assigned_to'])->exists()) {
                $validData['assigned_to'] = null;
            }
        }

        // التحقق من صلاحية المشروع (project_id)
        if (isset($validData['project_id']) && $validData['project_id']) {
            if (!\App\Models\Project::where('id', $validData['project_id'])->exists()) {
                $validData['project_id'] = null;
            }
        }

        // التحقق من صلاحية العنصر (item_id)
        if (isset($validData['item_id']) && $validData['item_id']) {
            if (!\App\Models\Item::where('id', $validData['item_id'])->exists()) {
                $validData['item_id'] = null;
            }
        }

        // معالجة تكرار البريد الإلكتروني (Email Uniqueness)
        if (isset($validData['email']) && $validData['email']) {
            $emailExists = Lead::where('email', $validData['email'])->exists();
            if ($emailExists) {
                $validData['email'] = $validData['email'] . '_restored_' . time();
            }
        }
        
        // معالجة تكرار الهاتف (Phone Uniqueness)
        if (isset($validData['phone']) && $validData['phone']) {
            $phoneExists = Lead::where('phone', $validData['phone'])->exists();
            if ($phoneExists) {
                $validData['phone'] = $validData['phone'] . '_' . time();
            }
        }

        // تنظيف حقول الحذف
        unset($validData['deleted_by']);
        
        // 4. إنشاء الليد من جديد
        $lead = new Lead();
        $lead->forceFill($validData);
        $lead->save();
        
        // 5. حذف السجل من الأرشيف
        $recycleLead->delete();
        
        return $lead;
    }

    public function restoreFromRecycle($id)
    {
        \Illuminate\Support\Facades\Log::info("Restore request received for RecycleLead ID: " . $id);
        try {
            // استخدام Transaction لضمان سلامة البيانات
            return \Illuminate\Support\Facades\DB::transaction(function () use ($id) {
                $recycleLead = RecycleLead::findOrFail($id);
                $this->_restoreRecycleLead($recycleLead);
                return response()->json(['message' => 'Lead restored successfully']);
            });
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Restore failed: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to restore lead', 'error' => $e->getMessage()], 500);
        }
    }

    public function forceDelete($id)
    {
        DB::transaction(function () use ($id) {
            $lead = Lead::withTrashed()->find($id);
            if ($lead) {
                $lead->forceDelete();
            }

            // Delete from Recycle Bin table as well
            \App\Models\RecycleLead::where('original_lead_id', $id)->delete();

            // Delete associated field values
            FieldValue::where('record_id', $id)
                ->whereIn('field_id', function($query) {
                    $query->select('id')->from('fields')->where('entity_id', function($q){
                        $q->select('id')->from('entities')->where('key', 'leads');
                    });
                })->delete();
        });

        return response()->json(['message' => 'Lead permanently deleted']);
    }

    public function bulkImport(Request $request)
    {
        $leads = $request->input('leads', []);
        $created = [];
        $errors = [];
        $duplicateCount = 0;
        $duplicateExistingCount = 0;
        $duplicateInFileCount = 0;

        $crm = \App\Models\CrmSetting::first();
        $enableDup = is_array($crm?->settings) ? (bool)($crm->settings['duplicationSystem'] ?? false) : false;
        $tenant = app()->bound('tenant') ? app('tenant') : null;
        $companyType = strtolower((string)($tenant?->company_type ?? ''));
        $currentUserId = \Illuminate\Support\Facades\Auth::id();
        $currentTenantId = $tenant?->id ?? (app()->bound('current_tenant_id') ? app('current_tenant_id') : null);
        
        if (!$currentTenantId && \Illuminate\Support\Facades\Auth::check()) {
            $currentTenantId = \Illuminate\Support\Facades\Auth::user()->tenant_id;
        }

        if (!$currentTenantId) {
            return response()->json(['message' => 'Tenant context not found.', 'count' => 0], 403);
        }

        $phonesInBatch = [];

        foreach ($leads as $index => $leadData) {
            try {
                $rowNum = $index + 2; 
                
                // 1. Strict Validation: Name, Phone, Source are REQUIRED
                $name = isset($leadData['name']) ? trim((string)$leadData['name']) : '';
                $rawPhone = isset($leadData['phone']) ? trim((string)$leadData['phone']) : '';
                $sourceName = isset($leadData['source']) ? trim((string)$leadData['source']) : '';
                $phoneCountryHint = isset($leadData['phone_country']) ? trim((string)$leadData['phone_country']) : null;
                $phone = PhoneNormalizer::normalize($rawPhone, $phoneCountryHint);
                
                if ($name === '' || $rawPhone === '' || $phone === '' || $sourceName === '') {
                    $missing = [];
                    if ($name === '') $missing[] = 'Name';
                    if ($rawPhone === '' || $phone === '') $missing[] = 'Phone';
                    if ($sourceName === '') $missing[] = 'Source';
                    $errors[] = "Row {$rowNum}: Missing required fields (" . implode(', ', $missing) . "). Row skipped.";
                    continue;
                }

                // 2. Project/Item handling - REQUIRED based on company type
                $projectName = trim((string)($leadData['project'] ?? ''));
                $itemName = trim((string)($leadData['item'] ?? ''));
                $projectId = null;
                $itemId = null;

                if ($companyType === 'general') {
                    if ($itemName === '') {
                        $errors[] = "Row {$rowNum}: Item is required for general companies. Row skipped.";
                        continue;
                    }
                    
                    $item = \App\Models\Item::where('tenant_id', $currentTenantId)
                        ->where(function($q) use ($itemName) {
                            $q->where('name', $itemName)->orWhere('code', $itemName);
                        })->first();
                    
                    if ($item) {
                        $itemId = $item->id;
                        $itemName = $item->name;
                    } else {
                        $errors[] = "Row {$rowNum}: Item '{$itemName}' not found. Row skipped.";
                        continue;
                    }
                } else {
                    if ($projectName === '') {
                        $errors[] = "Row {$rowNum}: Project is required. Row skipped.";
                        continue;
                    }
                    
                    $project = \App\Models\Project::where('tenant_id', $currentTenantId)
                        ->where(function($q) use ($projectName) {
                            $q->where('name', $projectName)->orWhere('name_ar', $projectName);
                        })->first();
                    
                    if ($project) {
                        $projectId = $project->id;
                        $projectName = $project->name;
                    } else {
                        $errors[] = "Row {$rowNum}: Project '{$projectName}' not found. Row skipped.";
                        continue;
                    }
                }

                // 3. Stage handling
                $incomingStage = isset($leadData['stage']) && trim($leadData['stage']) !== '' ? trim($leadData['stage']) : null;
                
                $stage = LeadStageResolver::resolve($currentTenantId, $incomingStage, true);
                if ($stage === null) {
                    $stageLabel = $incomingStage !== null && $incomingStage !== '' ? $incomingStage : '(empty)';
                    $errors[] = "Row {$rowNum}: Stage '{$stageLabel}' is not allowed for this tenant. Row skipped.";
                    continue;
                }

                $enteredStage = $this->sanitizeDuplicateEnteredStage($stage);
                $status = 'new';
                
                // 4. Duplicate Logic Check
                $isDuplicate = false;
                $isExistingDuplicate = false;
                $isInFileDuplicate = false;
                if ($enableDup) {
                    if (!empty($phone)) {
                        $variants = PhoneNormalizer::variantsForSearch($rawPhone, $phoneCountryHint);
                        $variants = !empty($variants) ? $variants : [$phone];
                        $existsInDb = \App\Models\Lead::where('tenant_id', $currentTenantId)->whereIn('phone', $variants)->exists();
                        $existsInBatch = in_array($phone, $phonesInBatch, true);

                        $isExistingDuplicate = $existsInDb;
                        $isInFileDuplicate = !$existsInDb && $existsInBatch;

                        $isDuplicate = $existsInDb || $existsInBatch;

                        // Track in-file duplicates for the batch when not already present in DB.
                        if (!$existsInDb) {
                            $phonesInBatch[] = $phone;
                        }
                    }

                    if ($isDuplicate) {
                        $status = 'duplicate';
                        $stage = 'Duplicate';
                    }
                }

                $nextActionDate = trim((string)($leadData['next_action_date'] ?? ''));
                $nextActionTime = trim((string)($leadData['next_action_time'] ?? ''));
                if ($nextActionDate !== '' && !preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $nextActionDate)) {
                    $nextActionDate = '';
                }
                if ($nextActionTime !== '' && !preg_match('/^\\d{2}:\\d{2}$/', $nextActionTime)) {
                    $nextActionTime = '';
                }

                $resolvedSourceName = TenantSourceLookup::resolveName($currentTenantId, $sourceName);
                if (!$resolvedSourceName) {
                    $errors[] = "Row {$rowNum}: Source '{$sourceName}' not found in sources table. Row skipped.";
                    continue;
                }
                $sourceName = $resolvedSourceName;

                // 6. Create Lead
                $metaData = [];
                $comment = trim((string)($leadData['comment'] ?? $leadData['comments'] ?? ''));
                $phoneCountry = isset($leadData['phone_country']) ? trim((string)$leadData['phone_country']) : '';
                if ($phoneCountry !== '') {
                    $metaData['phone_country'] = $phoneCountry;
                }
                $duplicateOfId = null;
                if ($status === 'duplicate' && $phone !== '') {
                    try {
                        $variants = PhoneNormalizer::variantsForSearch($rawPhone, $phoneCountryHint);
                        $variants = !empty($variants) ? $variants : [$phone];
                        $original = \App\Models\Lead::where('tenant_id', $currentTenantId)
                            ->whereIn('phone', $variants)
                            ->where(function ($q) {
                                $q->whereNull('status')->orWhere('status', '!=', 'duplicate');
                            })
                            ->orderBy('id', 'asc')
                            ->first();
                        if (!$original) {
                            $original = \App\Models\Lead::where('tenant_id', $currentTenantId)
                                ->whereIn('phone', $variants)
                                ->orderBy('id', 'asc')
                                ->first();
                        }
                        $duplicateOfId = $this->resolveDuplicateRootId($original, $currentTenantId);
                    } catch (\Throwable $e) {
                        $duplicateOfId = null;
                    }
                }
                if ($duplicateOfId) {
                    $metaData['duplicate_of'] = $duplicateOfId;
                }
                if ($status === 'duplicate' && $enteredStage !== null) {
                    $metaData['entered_stage'] = $enteredStage;
                }

                $lead = null;
                if ($status === 'duplicate' && $phone !== '' && $duplicateOfId) {
                    $variants = PhoneNormalizer::variantsForSearch($rawPhone, $phoneCountryHint);
                    $variants = !empty($variants) ? $variants : [$phone];

                    $existingDup = $this->findActiveDuplicateLead($currentTenantId, $variants, (int) $duplicateOfId);
                    if ($existingDup) {
                        $meta = !empty($metaData) && is_array($metaData) ? $metaData : [];
                        $attempt = $this->buildDuplicateAttemptMeta($request->user(), [
                            'source' => $sourceName,
                            'project' => $projectName !== '' ? $projectName : null,
                            'assigned_to' => null,
                        ], $meta, 'bulk_import');
                        $meta = $this->bumpDuplicateAttemptMeta($meta, $attempt);

                        $existingDup->fill([
                            'name' => $name,
                            'email' => $leadData['email'] ?? null,
                            'phone' => $phone,
                            'company' => $leadData['company'] ?? null,
                            'stage' => 'Duplicate',
                            'status' => 'duplicate',
                            'priority' => $leadData['priority'] ?? 'medium',
                            'source' => $sourceName,
                            'campaign' => $leadData['campaign'] ?? null,
                            'project' => $projectName !== '' ? $projectName : null,
                            'project_id' => $projectId,
                            'item_id' => $itemId,
                            'estimated_value' => $leadData['estimatedValue'] ?? 0,
                            'notes' => $leadData['notes'] ?? null,
                            'meta_data' => $meta,
                        ]);
                        $existingDup->save();
                        $lead = $existingDup;
                    }
                }

                if (!$lead) {
                    // New lead or first-time duplicate case.
                    if ($status === 'duplicate') {
                        $meta = !empty($metaData) && is_array($metaData) ? $metaData : [];
                        $attempt = $this->buildDuplicateAttemptMeta($request->user(), [
                            'source' => $sourceName,
                            'project' => $projectName !== '' ? $projectName : null,
                            'assigned_to' => null,
                        ], $meta, 'bulk_import');
                        $metaData = $this->bumpDuplicateAttemptMeta($meta, $attempt);
                    }

                    $lead = Lead::create([
                        'name' => $name,
                        'email' => $leadData['email'] ?? null,
                        'phone' => $phone,
                        'company' => $leadData['company'] ?? null,
                        'stage' => $stage,
                        'status' => $status,
                        'priority' => $leadData['priority'] ?? 'medium',
                        'source' => $sourceName,
                        'campaign' => $leadData['campaign'] ?? null,
                        'project' => $projectName !== '' ? $projectName : null,
                        'project_id' => $projectId,
                        'item_id' => $itemId,
                        'estimated_value' => $leadData['estimatedValue'] ?? 0,
                        'notes' => $leadData['notes'] ?? null,
                        'created_by' => $currentUserId,
                        'tenant_id' => $currentTenantId,
                        'meta_data' => !empty($metaData) ? $metaData : null,
                    ]);
                }
                 
                // Sales Person Assignment
                $assignedToRaw = trim((string)($leadData['assignedTo'] ?? ''));
                if ($assignedToRaw !== '') {
                    // Treat common template placeholders as empty (do not attempt lookup).
                    $assignedToNorm = mb_strtolower(trim($assignedToRaw));
                    $assignedToNorm = preg_replace('/\s+/u', ' ', $assignedToNorm);
                    if (in_array($assignedToNorm, ['اسم البائع', 'sales person', 'salesperson'], true)) {
                        $assignedToRaw = '';
                    }
                }

                if ($assignedToRaw !== '') {
                    $assignedUser = \App\Models\User::where('tenant_id', $currentTenantId)
                        ->where(function($q) use ($assignedToRaw) {
                            $q->where('id', $assignedToRaw)->orWhere('name', 'LIKE', "%{$assignedToRaw}%");
                        })->first();
                    
                    if ($assignedUser) {
                        $lead->assigned_to = $assignedUser->id;
                        $lead->sales_person = $assignedUser->name;
                        $lead->save();
                    } else {
                        $errors[] = "Row {$rowNum}: Sales Person '{$assignedToRaw}' not found.";
                    }
                }

                if ($status === 'duplicate') {
                    $duplicateCount++;
                    if ($isExistingDuplicate) {
                        $duplicateExistingCount++;
                    } elseif ($isInFileDuplicate) {
                        $duplicateInFileCount++;
                    }
                }

                $importedStageName = trim((string) ($row['Stage'] ?? $row['stage'] ?? ''));

                if ($nextActionDate !== '') {
                    try {
                        \App\Models\LeadAction::create([
                            'lead_id' => $lead->id,
                            'tenant_id' => $currentTenantId,
                            'user_id' => $lead->assigned_to ?: $currentUserId,
                            'action_type' => 'call',
                            'description' => $comment !== '' ? $comment : 'Imported next action',
                            'stage_id_at_creation' => null,
                            'next_action_type' => 'call',
                            'details' => array_filter([
                                'date' => $nextActionDate,
                                'time' => $nextActionTime !== '' ? $nextActionTime : null,
                                'status' => 'scheduled',
                                'source' => 'import',
                                'priority' => $lead->priority ?? 'medium',
                                'imported_stage' => $importedStageName !== '' ? $importedStageName : null,
                                'stage_at_creation_name' => $importedStageName !== '' ? $importedStageName : null,
                            ], fn($v) => $v !== null && $v !== ''),
                        ]);
                    } catch (\Throwable $e) {
                        $errors[] = "Row {$rowNum}: Failed to create next action ({$e->getMessage()}).";
                    }
                }

                // Import comment -> record as an action (so it appears in Last Comment + Actions timeline)
                if ($comment !== '' && $nextActionDate === '') {
                    try {
                        \App\Models\LeadAction::create([
                            'lead_id' => $lead->id,
                            'tenant_id' => $currentTenantId,
                            'user_id' => $currentUserId,
                            'action_type' => 'comment',
                            'description' => $comment,
                            'stage_id_at_creation' => null,
                            'next_action_type' => null,
                            'details' => array_filter([
                                'status' => 'done',
                                'source' => 'import',
                                'imported_stage' => $importedStageName !== '' ? $importedStageName : null,
                                'stage_at_creation_name' => $importedStageName !== '' ? $importedStageName : null,
                            ], fn($v) => $v !== null && $v !== ''),
                        ]);
                    } catch (\Throwable $e) {
                        $errors[] = "Row {$rowNum}: Failed to store imported comment ({$e->getMessage()}).";
                    }
                }
                
                $created[] = $lead->id;
            } catch (\Exception $e) {
                $errors[] = "Row " . ($index + 2) . ": " . $e->getMessage();
                continue;
            }
        }

        $createdCount = count($created);
        $newCount = max(0, $createdCount - $duplicateCount);

        return response()->json([
            'message' => 'Import completed',
            'count' => $createdCount,
            'new_count' => $newCount,
            'duplicate_count' => $duplicateCount,
            'duplicate_existing_count' => $duplicateExistingCount,
            'duplicate_in_file_count' => $duplicateInFileCount,
            'errors' => $errors
        ], 200);
    }

    public function bulkAssign(Request $request)
    {
        $request->validate([
            'ids'          => 'required|array',
            'assigned_to'  => 'required',
            'assign_role'  => 'nullable|in:sales,manager',
            'stage'        => 'nullable|string|in:same_stage,new_lead,cold_calls',
            'history_option' => 'nullable|string|in:keep_history,assign_as_new',
            'options'      => 'nullable|array',
        ]);

        $role          = $request->input('assign_role', 'sales');
        $userId        = $request->assigned_to;
        $currentUserId = $request->user()->id;
        $options       = $request->input('options', []);
        $targetStage   = $request->input('stage', 'new_lead');   // new_lead | cold_calls | same_stage
        $historyOption = $request->input('history_option', 'keep_history'); // keep_history | assign_as_new
        $clearHistory  = $historyOption === 'assign_as_new';
        $notifyLeadIds  = [];
        $oldAssigneeMap = [];

        DB::transaction(function () use ($request, $role, $userId, $currentUserId, $options, $targetStage, $clearHistory, &$notifyLeadIds, &$oldAssigneeMap) {
            if ($role === 'manager') {
                Lead::whereIn('id', $request->ids)
                    ->orderBy('id')
                    ->chunk(200, function ($leads) use ($userId) {
                        foreach ($leads as $lead) {
                            $lead->manager_id = $userId;
                            $lead->assigned_to = null;
                            $lead->sales_person = null;
                            $lead->save();
                        }
                    });
            } else {
                // Assigning to Sales Person
                $user = \App\Models\User::find($userId);

                Lead::whereIn('id', $request->ids)
                    ->orderBy('id')
                    ->chunk(200, function ($leads) use ($currentUserId, $user, $userId, $targetStage, $clearHistory, &$notifyLeadIds, &$oldAssigneeMap) {
                        $resetMap = [];
                        if ($clearHistory) {
                            $ids = $leads->pluck('id')->all();
                            $resetMap = \App\Models\LeadAction::query()
                                ->whereIn('lead_id', $ids)
                                ->selectRaw('lead_id, max(id) as max_id')
                                ->groupBy('lead_id')
                                ->pluck('max_id', 'lead_id')
                                ->toArray();
                        }

                        foreach ($leads as $lead) {
                            $this->ensureUserCanBeAssignedLeadSource($user, $lead->source);
                            $this->ensureUserCanBeAssignedLeadProject($user, $this->resolveLeadProjectLabel($lead));
                            $oldAssigneeMap[$lead->id] = $lead->assigned_to;
                            $resolvedStageId = $this->resolveSalesAssignmentStageId((int) ($lead->tenant_id ?? $request->user()?->tenant_id ?? 0), $targetStage, $lead->stage_id ? (int) $lead->stage_id : null);

                            if (empty($lead->manager_id)) {
                                if ($user && !empty($user->manager_id)) {
                                    $lead->manager_id = $user->manager_id;
                                } else {
                                    $lead->manager_id = $currentUserId;
                                }
                            }

                            $lead->assigned_to = $userId;
                            if ($user) {
                                $lead->sales_person = $user->name;
                            }

                            $stageLower  = strtolower(trim((string) ($lead->stage ?? '')));
                            $statusLower = strtolower(trim((string) ($lead->status ?? '')));

                            // Apply stage transition based on selected option
                            if ($stageLower !== 'duplicate' && $statusLower !== 'duplicate') {
                                if ($targetStage === 'new_lead') {
                                    $lead->stage  = 'New Lead';
                                    $lead->status = 'pending';
                                } elseif ($targetStage === 'cold_calls') {
                                    $lead->stage  = 'Cold Calls';
                                    $lead->status = 'pending';
                                } else {
                                    // same_stage: keep current stage, just mark pending
                                    $lead->status = 'pending';
                                }
                            }

                            if (!empty($resolvedStageId)) {
                                $lead->stage_id = (int) $resolvedStageId;
                            }

                            // Clear History = independent visibility flag; does NOT override stage
                            if ($clearHistory) {
                                $lead->history_hidden_before_action_id = $resetMap[$lead->id] ?? null;
                                $lead->sales_view_reset_at = now();
                            } else {
                                $lead->history_hidden_before_action_id = null;
                                $lead->sales_view_reset_at = null;
                            }

                            $lead->save();

                            if (!empty($lead->assigned_to) && (string) $lead->assigned_to !== (string) ($oldAssigneeMap[$lead->id] ?? null)) {
                                $notifyLeadIds[] = $lead->id;
                            }
                        }
                    });
            }
        });

        // Notify assignee (and configured recipients) when reassigned via bulk assign
        if ($role !== 'manager' && !empty($notifyLeadIds)) {
            try {
                $assignee = User::with(['manager', 'team.leader'])->find($userId);
                $actor = $request->user();
                if ($assignee && $actor) {
                    foreach (array_values(array_unique($notifyLeadIds)) as $leadId) {
                        try {
                            $leadFresh = Lead::with(['assignedAgent:id,name', 'creator:id,name'])->find($leadId);
                            if (!$leadFresh) {
                                continue;
                            }

                            $notification = new \App\Notifications\LeadAssigned($leadFresh, $actor->name);
                            $previousOwnerId = $oldAssigneeMap[$leadId] ?? null;
                            $previousOwner = $previousOwnerId ? User::find($previousOwnerId) : null;
                            $recipients = $this->buildNotificationRecipients(
                                $assignee,
                                [
                                    'owner' => $leadFresh->creator,
                                    'assignee' => $assignee,
                                    'assigner' => $actor,
                                    'previous_owner' => $previousOwner,
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
                        } catch (\Throwable $e) {
                        }
                    }
                }
            } catch (\Throwable $e) {
            }
        }

        return response()->json(['message' => 'Leads assigned successfully']);
    }

    public function bulkStatus(Request $request)
    {
        $request->validate([
            'ids' => 'required|array',
            'status' => 'required|string'
        ]);

        Lead::whereIn('id', $request->ids)->update(['status' => $request->status]);

        return response()->json(['message' => 'Leads status updated successfully']);
    }

    public function bulkDelete(Request $request)
    {
        $request->validate([
            'ids' => 'required|array'
        ]);

        $ids = $request->ids;
        
        DB::transaction(function () use ($ids) {
            $leads = Lead::whereIn('id', $ids)->get();
            
            foreach ($leads as $lead) {
                \App\Models\RecycleLead::create([
                    'original_lead_id' => $lead->id,
                    'lead_data' => $lead->toArray(),
                    'deleted_by' => \Illuminate\Support\Facades\Auth::id(),
                    'deleted_at' => now(),
                ]);
            }

            // Then delete permanently from source
            Lead::whereIn('id', $ids)->forceDelete();
        });

        return response()->json(['message' => 'Leads moved to recycle bin successfully']);
    }

    public function bulkRestore(Request $request)
    {
        $request->validate([
            'ids' => 'required|array'
        ]);

        $ids = $request->ids;
        $restoredCount = 0;
        $errors = [];

        // Find RecycleLead entries where original_lead_id is in the list
        // OR id is in the list (in case frontend sends recycle_id)
        $recycleLeads = RecycleLead::whereIn('original_lead_id', $ids)
                                    ->orWhereIn('id', $ids)
                                    ->get();

        foreach ($recycleLeads as $recycleLead) {
            try {
                DB::transaction(function () use ($recycleLead) {
                    $this->_restoreRecycleLead($recycleLead);
                });
                $restoredCount++;
            } catch (\Exception $e) {
                $errors[] = "Failed to restore lead (Recycle ID: {$recycleLead->id}): " . $e->getMessage();
                \Illuminate\Support\Facades\Log::error("Bulk restore error for RecycleLead {$recycleLead->id}: " . $e->getMessage());
            }
        }

        if (count($errors) > 0) {
            return response()->json(['message' => "Restored $restoredCount leads with some errors", 'errors' => $errors], 207);
        }

        return response()->json(['message' => 'Leads restored successfully']);
    }

    public function bulkForceDelete(Request $request)
    {
        $request->validate([
            'ids' => 'required|array'
        ]);

        $ids = $request->ids;

        DB::transaction(function () use ($ids) {
            // Delete from Recycle Bin table first
            \App\Models\RecycleLead::whereIn('original_lead_id', $ids)->delete();

            // Then delete permanently from Leads table
            Lead::withTrashed()->whereIn('id', $ids)->forceDelete();

            // Delete associated field values
            FieldValue::whereIn('record_id', $ids)
                ->whereIn('field_id', function($query) {
                    $query->select('id')->from('fields')->where('entity_id', function($q){
                        $q->select('id')->from('entities')->where('key', 'leads');
                    });
                })->delete();
        });

        return response()->json(['message' => 'Leads permanently deleted']);
    }

    public function recycleBin(Request $request)
    {
        try {
            $tenantId = null;
            if (app()->bound('current_tenant_id')) {
                $tenantId = app('current_tenant_id');
            } elseif (\Illuminate\Support\Facades\Auth::check()) {
                $tenantId = \Illuminate\Support\Facades\Auth::user()->tenant_id;
            }

            // Optimization: Select only necessary columns from RecycleLead
            $query = RecycleLead::select(['id', 'original_lead_id', 'lead_data', 'deleted_at', 'deleted_by']);
            
            if ($tenantId) {
                 // Filter by tenant_id in the JSON column
                 // Assuming MySQL 5.7+ or MariaDB compatible with JSON
                 $query->where('lead_data->tenant_id', $tenantId);
            }

            // Limit results to prevent memory exhaustion, or use pagination if frontend supported it
            // For now, limiting to 500 recent items for stability
            $recycledLeads = $query->orderBy('deleted_at', 'desc')->limit(500)->get();
            
            $data = $recycledLeads->map(function ($item) {
                $leadData = $item->lead_data;
                if (!is_array($leadData)) {
                    $leadData = json_decode($leadData, true) ?? [];
                }
                // Ensure we have an ID
                if (!isset($leadData['id'])) {
                    $leadData['id'] = $item->original_lead_id;
                }
                
                // Add recycle metadata
                $leadData['recycle_id'] = $item->id;
                $leadData['deleted_at'] = $item->deleted_at->toIso8601String();
                $leadData['deleted_by'] = $item->deleted_by;

                // Optimization: Filter returned fields to reduce payload size
                $allowedFields = [
                    'id', 'recycle_id', 'name', 'email', 'phone', 'company', 
                    'status', 'stage', 'priority', 'source', 'assigned_to', 
                    'assignedTo', 'created_at', 'lastContact', 'estimated_value', 
                    'estimatedValue', 'notes', 'deleted_at', 'deleted_by',
                    'old_stage', 'oldStage', 'project', 'project_id', 'item_id'
                ];
                
                return \Illuminate\Support\Arr::only($leadData, $allowedFields);
            });

            return response()->json($data);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Recycle Bin Error: ' . $e->getMessage());
            return response()->json([
                'message' => 'Failed to fetch recycle bin', 
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function reassignmentReport(Request $request)
    {
        try {
            $user = $request->user();
            if (!$user) {
                abort(401, 'Unauthorized');
            }

            $tenantStartDate = null;
            if ($user->tenant_id) {
                $tenant = Tenant::query()->find($user->tenant_id);
                $tenantStartDate = $tenant?->start_date?->startOfDay()
                    ?? $tenant?->created_at?->startOfDay();
            }

            $dateFrom = $request->input('date_from') ?: ($tenantStartDate?->toDateString() ?? now()->startOfMonth()->toDateString());
            $dateTo = $request->input('date_to') ?: now()->endOfDay()->toDateString();

            $query = Activity::query()
                ->where('subject_type', Lead::class)
                ->where('event', 'updated')
                ->whereDate('created_at', '>=', $dateFrom)
                ->whereDate('created_at', '<=', $dateTo);

            if ($user->tenant_id) {
                $query->where('tenant_id', $user->tenant_id);
            }

            // Hierarchy Filter: Only show logs where from_user, to_user, or causer is in the user's viewable scope
            $roleLower = strtolower($user->role ?? '');
            $isAdminOrDirector = $user->is_super_admin || 
                                in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

            $viewableUserIds = null;
            if (!$isAdminOrDirector) {
                $viewableUserIds = $this->getViewableUserIds($user);
            }

            $logs = $query->with(['causer', 'subject'])->latest()->get();

            $transactions = [];
            $userIds = [];
            // We don't need leadIds for the aggregated view, but we might need them if we want to show lead names in a tooltip or drilldown.
            // For the requested table (aggregated), we just need counts.

            $grouped = [];

            foreach ($logs as $log) {
                $props = $log->properties;
                
                // Ensure props is an array/collection, Spatie usually returns Collection or Array
                if (!is_array($props) && is_object($props) && method_exists($props, 'toArray')) {
                    $props = $props->toArray();
                }
                if (!is_array($props)) {
                    // Fallback or skip if properties are malformed
                    continue; 
                }

                $attrs = is_array($props['attributes'] ?? null) ? $props['attributes'] : [];
                $old = is_array($props['old'] ?? null) ? $props['old'] : [];

                $newAssignee = $attrs['assigned_to'] ?? null;
                $oldAssignee = $old['assigned_to'] ?? null;

                $newManager = $attrs['manager_id'] ?? null;
                $oldManager = $old['manager_id'] ?? null;

                // Check for stage/status changes in the same log
                // Note: If stage didn't change during assignment, these might be null.
                // We'll use 'N/A' or 'Unchanged' if not present in the log.
                $stageBefore = $old['stage'] ?? ($old['status'] ?? 'N/A');
                $stageAfter = $attrs['stage'] ?? ($attrs['status'] ?? 'N/A');

                if ($stageBefore === 'N/A' && $log->subject) {
                    $stageBefore = $log->subject->stage ?? 'N/A';
                }
                if ($stageAfter === 'N/A' && $log->subject) {
                    $stageAfter = $log->subject->stage ?? 'N/A';
                }

                // Ensure stage strings are safe for implode
                $stageBefore = is_string($stageBefore) ? $stageBefore : (string)$stageBefore;
                $stageAfter = is_string($stageAfter) ? $stageAfter : (string)$stageAfter;

                $assignedTouched = array_key_exists('assigned_to', $attrs);
                $managerTouched = array_key_exists('manager_id', $attrs);

                if (!$assignedTouched && !$managerTouched) {
                    continue;
                }

                $hasChange = false;
                if ($assignedTouched && $newAssignee !== $oldAssignee) {
                    $hasChange = true;
                }
                if ($managerTouched && $newManager !== $oldManager) {
                    $hasChange = true;
                }
                if (!$hasChange) {
                    continue;
                }

                // Apply Hierarchy Filter
                if ($viewableUserIds !== null) {
                    $userIdsInLog = array_filter([$log->causer_id, $oldAssignee, $newAssignee, $oldManager, $newManager]);
                    $isInScope = false;
                    foreach ($userIdsInLog as $uid) {
                        if (in_array((int)$uid, $viewableUserIds)) {
                            $isInScope = true;
                            break;
                        }
                    }
                    if (!$isInScope) {
                        continue;
                    }
                }

                $date = $log->created_at->format('Y-m-d');

                // Group Key
                $causer = $log->causer_id ?? 'system';
                $key = implode('|', [
                    $date,
                    $oldAssignee ?? 'null',
                    $newAssignee ?? 'null',
                    $oldManager ?? 'null',
                    $newManager ?? 'null',
                    $stageBefore,
                    $stageAfter,
                    $causer
                ]);

                if (!isset($grouped[$key])) {
                    $grouped[$key] = [
                        'date' => $date,
                        'from_sales_id' => $assignedTouched ? $oldAssignee : null,
                        'to_sales_id' => $assignedTouched ? $newAssignee : null,
                        'from_manager_id' => $managerTouched ? $oldManager : null,
                        'to_manager_id' => $managerTouched ? $newManager : null,
                        'stage_before' => $stageBefore,
                        'stage_after' => $stageAfter,
                        'count' => 0,
                        'causer_id' => $log->causer_id
                    ];
                }
                $grouped[$key]['count']++;

                if ($log->causer_id) $userIds[] = $log->causer_id;
                if ($oldAssignee) $userIds[] = $oldAssignee;
                if ($newAssignee) $userIds[] = $newAssignee;
                if ($oldManager) $userIds[] = $oldManager;
                if ($newManager) $userIds[] = $newManager;
            }

            if (empty($grouped)) {
                return response()->json([
                    'transactions' => [],
                    'stats' => [
                        'total_reassigned' => 0,
                        'unassigned_count' => 0,
                    ],
                    'aggregates' => [
                        'top_receivers' => [],
                        'top_senders' => [],
                    ]
                ]);
            }

            $users = User::with('manager')->whereIn('id', array_unique($userIds))->get()->keyBy('id');

            $filteredTransactions = [];
            $fromManagerId = $request->input('from_manager_id');
            $toManagerId = $request->input('to_manager_id');
            $fromSalesId = $request->input('from_sales_id');
            $toSalesId = $request->input('to_sales_id');

            foreach ($grouped as $group) {
                $fromSales = $group['from_sales_id'] ? ($users[$group['from_sales_id']] ?? null) : null;
                $toSales = $group['to_sales_id'] ? ($users[$group['to_sales_id']] ?? null) : null;
                $fromManager = $group['from_manager_id'] ? ($users[$group['from_manager_id']] ?? null) : null;
                $toManager = $group['to_manager_id'] ? ($users[$group['to_manager_id']] ?? null) : null;
                $byUser = $group['causer_id'] ? ($users[$group['causer_id']] ?? null) : null;
                
                // Apply Filters
                if ($fromManagerId && (string)($group['from_manager_id'] ?? '') !== (string)$fromManagerId) continue;
                if ($toManagerId && (string)($group['to_manager_id'] ?? '') !== (string)$toManagerId) continue;
                if ($fromSalesId && (string)($group['from_sales_id'] ?? '') !== (string)$fromSalesId) continue;
                if ($toSalesId && (string)($group['to_sales_id'] ?? '') !== (string)$toSalesId) continue;

                $fromUserPayload = $fromSales ? [
                    'id' => $fromSales->id,
                    'name' => $fromSales->name,
                    'manager' => $fromSales->manager ? ['id' => $fromSales->manager->id, 'name' => $fromSales->manager->name] : null
                ] : [
                    'id' => null,
                    'name' => '-',
                    'manager' => $fromManager ? ['id' => $fromManager->id, 'name' => $fromManager->name] : null
                ];

                $toUserPayload = $toSales ? [
                    'id' => $toSales->id,
                    'name' => $toSales->name,
                    'manager' => $toSales->manager ? ['id' => $toSales->manager->id, 'name' => $toSales->manager->name] : null
                ] : [
                    'id' => null,
                    'name' => '-',
                    'manager' => $toManager ? ['id' => $toManager->id, 'name' => $toManager->name] : null
                ];

                $filteredTransactions[] = [
                    'id' => uniqid(), // Virtual ID for key
                    'date' => $group['date'],
                    'quantity' => $group['count'],
                    'stage_before' => $group['stage_before'],
                    'stage_after' => $group['stage_after'],
                    'from_user' => $fromUserPayload,
                    'to_user' => $toUserPayload,
                    'by_user' => $byUser ? [
                        'id' => $byUser->id,
                        'name' => $byUser->name
                    ] : ['id' => null, 'name' => 'System'],
                ];
            }

            // Calculate Stats based on aggregated data
            $totalReassigned = collect($filteredTransactions)->sum('quantity');

            // "Current" unassigned leads should reflect the current leads table,
            // not historical reassignment transactions that temporarily ended unassigned.
            $currentSnapshotRequest = Request::create('/api/leads', 'GET', []);
            $currentUnassignedQuery = $this->buildFilteredLeadsQuery($currentSnapshotRequest, $user, false);
            $unassignedCount = (clone $currentUnassignedQuery)
                ->where(function ($q) {
                    $q->whereNull('leads.assigned_to')
                      ->orWhere('leads.assigned_to', '')
                      ->orWhere('leads.assigned_to', '0')
                      ->orWhere('leads.assigned_to', 0);
                })
                ->count();

            $receivers = collect($filteredTransactions)
                ->whereNotNull('to_user.id')
                ->groupBy('to_user.name')
                ->map(fn($rows) => $rows->sum('quantity'))
                ->sortDesc()
                ->take(5)
                ->map(fn($count, $name) => ['name' => $name, 'count' => $count])
                ->values(); // Reset keys for array
                
            $senders = collect($filteredTransactions)
                ->whereNotNull('from_user.id')
                ->groupBy('from_user.name')
                ->map(fn($rows) => $rows->sum('quantity'))
                ->sortDesc()
                ->take(5)
                ->map(fn($count, $name) => ['name' => $name, 'count' => $count])
                ->values();

            // Pagination
            $page = $request->input('page', 1);
            $perPage = $request->input('per_page', 10);
            $offset = ($page - 1) * $perPage;
            
            $paginatedTransactions = array_slice($filteredTransactions, $offset, $perPage);
            $total = count($filteredTransactions);

            return response()->json([
                'transactions' => [
                    'data' => $paginatedTransactions,
                    'total' => $total,
                    'per_page' => $perPage,
                    'current_page' => $page,
                    'last_page' => ceil($total / $perPage),
                ],
                'stats' => [
                    'total_reassigned' => $totalReassigned,
                    'unassigned_count' => $unassignedCount,
                ],
                'aggregates' => [
                    'top_receivers' => $receivers, // Already formatted as array of objects
                    'top_senders' => $senders,
                ]
            ]);

        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Reassignment Report Error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            return response()->json([
                'message' => 'Failed to generate reassignment report',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    public function resolveDuplicate(Request $request, $id)
    {
        try {
            $duplicateLead = Lead::findOrFail($id);

            // Only privileged users can work with duplicates.
            $crm = \App\Models\CrmSetting::first();
            $enableDup = is_array($crm?->settings) ? (bool)($crm->settings['duplicationSystem'] ?? false) : false;
            if ($enableDup && (strtolower((string)($duplicateLead->status ?? '')) === 'duplicate' || strtolower((string)($duplicateLead->stage ?? '')) === 'duplicate')) {
                if (!$this->canViewDuplicates($request->user())) {
                    abort(403, 'Unauthorized to resolve duplicate leads');
                }
            }
            
            $request->validate([
                'original_lead_id' => 'required|exists:leads,id',
                'action' => 'required|in:keep_original,keep_duplicate',
                'updated_data' => 'nullable|array',
                // When keeping the original, callers may optionally choose not to merge/transfer history from duplicate.
                // Default is true for backward compatibility.
                'move_history' => 'nullable|boolean',
            ]);
            
            $originalLead = Lead::findOrFail($request->original_lead_id);
            $action = $request->action;
            $moveHistory = filter_var($request->input('move_history', true), FILTER_VALIDATE_BOOLEAN);
            
            DB::transaction(function() use ($originalLead, $duplicateLead, $action, $request, $moveHistory) {
                if ($action === 'keep_duplicate') {
                    // 1. Update original lead with data from request (which came from duplicate)
                    if ($request->has('updated_data')) {
                        // Exclude fields that shouldn't be overwritten
                        $data = $request->updated_data;
                        unset($data['id'], $data['_id'], $data['created_at'], $data['updated_at'], $data['deleted_at']);
                        
                        // Ensure we don't copy the 'duplicate' status/stage to the original lead
                        if (isset($data['status']) && strtolower($data['status']) === 'duplicate') {
                            $data['status'] = 'new'; // Reset to new if it was marked as duplicate
                        }
                        if (isset($data['stage']) && strtolower($data['stage']) === 'duplicate') {
                            $data['stage'] = 'New Lead'; // Reset to default stage
                        }
                        
                        $originalLead->update($data);
                    }
                    
                    // 2. Move history (actions) from duplicate to original
                    \App\Models\LeadAction::where('lead_id', $duplicateLead->id)
                        ->update(['lead_id' => $originalLead->id]);
                        
                    // 3. Move activity logs (Spatie)
                    \Spatie\Activitylog\Models\Activity::where('subject_type', Lead::class)
                        ->where('subject_id', $duplicateLead->id)
                        ->update(['subject_id' => $originalLead->id]);
                } else {
                    // keep_original: ensure original is NOT marked as duplicate
                    if (strtolower($originalLead->status) === 'duplicate') {
                        $originalLead->status = 'new';
                    }
                    if (strtolower($originalLead->stage) === 'duplicate') {
                        $originalLead->stage = 'New Lead';
                    }
                    $originalLead->save();

                    if ($moveHistory) {
                        // move history from duplicate to original
                        \App\Models\LeadAction::where('lead_id', $duplicateLead->id)
                            ->update(['lead_id' => $originalLead->id]);
                    }
                }
                
                // Finally delete the duplicate lead
                $duplicateLead->delete();
                
                // Log the merge on original lead
                // Only log if we actually altered data/history, otherwise "Keep & Save" should be a no-op on the original.
                if ($action === 'keep_duplicate' || $moveHistory) {
                    activity()
                        ->performedOn($originalLead)
                        ->causedBy(Auth::user())
                        ->withProperties(['duplicate_lead_id' => $duplicateLead->id, 'action' => $action, 'move_history' => $moveHistory])
                        ->log("Lead resolved as duplicate. Action: {$action}");
                }
            });
            
            $freshLead = $originalLead->fresh(['actions', 'activities', 'assignedAgent:id,name', 'creator:id,name']);
            $this->appendLeadDisplayLabels($freshLead);

            return response()->json([
                'message' => 'Duplicate lead resolved successfully',
                'lead' => $freshLead
            ]);
            
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Resolve Duplicate Error: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to resolve duplicate', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Bulk actions for duplicate leads (stored inside leads table).
     * Actions:
     * - resolve_keep_original: deletes the duplicate lead and keeps original (uses meta_data.duplicate_of).
     * - enable_duplicate: converts duplicate lead into a normal lead (clears duplicate flags/link).
     * - transfer: assigns the duplicate lead to a new sales person (requires sales_id).
     * - warn: sends notification about duplicates (uses meta_data.duplicate_of if original_lead_id not provided).
     */
    public function bulkDuplicateAction(Request $request)
    {
        $user = $request->user();
        if (!$this->canViewDuplicates($user)) {
            abort(403, 'Unauthorized');
        }

        $request->validate([
            'action' => 'required|string|in:resolve_keep_original,keep_save,keep_and_save,enable_duplicate,transfer,warn',
            'lead_ids' => 'required|array|min:1',
            'lead_ids.*' => 'integer|exists:leads,id',
            'sales_id' => 'nullable|integer|exists:users,id',
            'original_lead_id' => 'nullable|integer|exists:leads,id',
            'stage' => 'nullable|string|in:same_stage,new_lead,cold_calls',
            'history_option' => 'nullable|string|in:keep_history,assign_as_new',
        ]);

        $action = $request->input('action');
        $leadIds = array_values(array_unique(array_map('intval', $request->input('lead_ids', []))));
        $salesId = $request->input('sales_id');
        $explicitOriginalId = $request->input('original_lead_id');
        $stageOption = $request->input('stage') ?: 'same_stage';
        $historyOption = $request->input('history_option') ?: 'keep_history';

        $success = [];
        $failed = [];

        foreach ($leadIds as $id) {
            try {
                /** @var Lead $dup */
                $dup = Lead::findOrFail($id);
                $isDup = strtolower((string)($dup->status ?? '')) === 'duplicate' || strtolower((string)($dup->stage ?? '')) === 'duplicate';
                if (!$isDup) {
                    $failed[] = ['id' => $id, 'reason' => 'Not a duplicate lead'];
                    continue;
                }

                $meta = is_array($dup->meta_data ?? null) ? ($dup->meta_data ?? []) : [];
                $originalId = $explicitOriginalId ?: ($meta['duplicate_of'] ?? null);

                if (in_array($action, ['resolve_keep_original', 'keep_save', 'keep_and_save'], true)) {
                    if (!$originalId) {
                        $failed[] = ['id' => $id, 'reason' => 'Missing duplicate_of'];
                        continue;
                    }
                    $req = new Request([
                        'original_lead_id' => (int)$originalId,
                        'action' => 'keep_original',
                    ]);
                    $req->setUserResolver(fn () => $user);
                    $this->resolveDuplicate($req, $dup->id);
                    $success[] = $id;
                    continue;
                }

                if ($action === 'enable_duplicate') {
                    // Convert to normal lead: clear duplicate status/stage and unlink.
                    $meta = is_array($dup->meta_data ?? null) ? ($dup->meta_data ?? []) : [];
                    $enteredStage = trim((string) ($meta['entered_stage'] ?? ''));
                    if (array_key_exists('duplicate_of', $meta)) {
                        unset($meta['duplicate_of']);
                    }
                    $dup->meta_data = $meta;
                    if (strtolower((string)$dup->status) === 'duplicate') {
                        $dup->status = 'new';
                    }
                    if (strtolower((string)$dup->stage) === 'duplicate') {
                        $dup->stage = $enteredStage !== '' ? $enteredStage : 'New Lead';
                    }
                    $dup->save();
                    $success[] = $id;
                    continue;
                }

                if ($action === 'transfer') {
                    if (!$salesId) {
                        $failed[] = ['id' => $id, 'reason' => 'sales_id is required'];
                        continue;
                    }
                    if (!$originalId) {
                        $failed[] = ['id' => $id, 'reason' => 'Missing original_lead_id/duplicate_of'];
                        continue;
                    }

                    // Transfer the ORIGINAL lead, and pass duplicate_id so it gets resolved.
                    $req = new Request([
                        'assigned_to' => (int)$salesId,
                        'stage' => $stageOption,
                        'history_option' => $historyOption,
                        'duplicate_id' => $dup->id,
                    ]);
                    $req->setUserResolver(fn () => $user);
                    $this->transfer($req, (int)$originalId);
                    $success[] = $id;
                    continue;
                }

                if ($action === 'warn') {
                    if (!$originalId) {
                        $failed[] = ['id' => $id, 'reason' => 'Missing original_lead_id/duplicate_of'];
                        continue;
                    }
                    $req = new Request(['original_lead_id' => (int)$originalId]);
                    $req->setUserResolver(fn () => $user);
                    $this->warnDuplicate($req, $dup->id);
                    $success[] = $id;
                    continue;
                }

                $failed[] = ['id' => $id, 'reason' => 'Unknown action'];
            } catch (\Throwable $e) {
                $failed[] = ['id' => $id, 'reason' => $e->getMessage()];
            }
        }

        return response()->json([
            'action' => $action,
            'success' => $success,
            'failed' => $failed,
            'success_count' => count($success),
            'failed_count' => count($failed),
        ]);
    }

    public function warnDuplicate(Request $request, $id)
    {
        try {
            $duplicateLead = Lead::findOrFail($id);
            
            // Validate request
            $request->validate([
                'original_lead_id' => 'required|exists:leads,id',
                'notes' => 'nullable|string'
            ]);
            
            $originalLead = Lead::findOrFail($request->original_lead_id);
            
            // Update the duplicate lead notes
            if ($request->has('notes')) {
                $duplicateLead->notes = $request->notes;
                $duplicateLead->save();
            }
            
            // Notify the assigned agent of the duplicate lead
            if ($duplicateLead->assigned_to) {
                // assigned_to stores user ID
                $assignedUser = User::find($duplicateLead->assigned_to);
                if ($assignedUser) {
                    $assignedUser->notify(new \App\Notifications\DuplicateLeadWarning($duplicateLead, $originalLead));
                }
            }
            
            return response()->json([
                'message' => 'Agent warned successfully',
                'lead' => $duplicateLead->fresh(['assignedAgent:id,name', 'creator:id,name'])
            ]);
            
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error('Warn Duplicate Error: ' . $e->getMessage());
            return response()->json(['message' => 'Failed to warn agent', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Clone a lead and assign the clone to a new salesperson as a fresh lead.
     * The original lead is NOT modified — it stays with its current assignee, stage, and history.
     * The new lead is flagged with is_duplicate_exception = true so it never gets blocked by
     * duplicate detection, and linked back via original_lead_id.
     */
    public function duplicateAndAssignAsFresh(Request $request, $id)
    {
        $originalLead = Lead::findOrFail($id);

        $request->validate([
            'assigned_to'    => 'required',
            'history_option' => 'nullable|in:keep_history,assign_as_new',
        ]);

        $newAgentId    = $request->assigned_to;
        $clearHistory  = $request->input('history_option') === 'assign_as_new';
        $currentUser   = $request->user();

        $user = \App\Models\User::where('id', $newAgentId)
            ->orWhere('name', $newAgentId)
            ->first();

        if ($user) {
            $this->ensureUserCanBeAssignedLeadSource($user, $originalLead->source);
            $this->ensureUserCanBeAssignedLeadProject($user, $this->resolveLeadProjectLabel($originalLead));
        }

        $clonedLead = DB::transaction(function () use ($originalLead, $user, $newAgentId, $clearHistory, $currentUser) {
            // Copy core fields — skip identity/tracking fields
            $skip = [
                'id', 'created_at', 'updated_at', 'deleted_at', 'deleted_by',
                'assigned_to', 'sales_person', 'manager_id',
                'stage', 'stage_id', 'status',
                'history_hidden_before_action_id', 'sales_view_reset_at',
                'is_duplicate_exception', 'original_lead_id',
                'last_action_at', 'assigned_at',
            ];

            $cloneData = collect($originalLead->getAttributes())
                ->except($skip)
                ->toArray();

            // Override fields for the new lead
            $cloneData['stage']                   = 'New Lead';
            $cloneData['status']                  = 'pending';
            $cloneData['assigned_to']             = $user?->id ?? $newAgentId;
            $cloneData['sales_person']             = $user?->name ?? null;
            $cloneData['is_duplicate_exception']  = true;
            $cloneData['original_lead_id']        = $originalLead->id;
            $cloneData['created_by']              = $currentUser->id;
            $cloneData['assigned_at']             = now();
            $cloneData['stage_id']                = $this->resolveSalesAssignmentStageId((int) ($originalLead->tenant_id ?? $currentUser->tenant_id ?? 0), 'new_lead');

            // Determine manager
            if ($user && !empty($user->manager_id)) {
                $cloneData['manager_id'] = $user->manager_id;
            } else {
                $cloneData['manager_id'] = $currentUser->id;
            }

            // Strip duplicate_of from meta_data so clone is not linked as duplicate
            $meta = is_array($cloneData['meta_data'] ?? null) ? $cloneData['meta_data'] : [];
            unset($meta['duplicate_of'], $meta['entered_stage'], $meta['duplicate_attempts']);
            $meta['cloned_from_lead_id'] = $originalLead->id;
            $cloneData['meta_data'] = $meta;

            $clone = Lead::create($cloneData);

            // Optionally hide history from new assignee (nothing to hide on a fresh clone,
            // but we honour the flag for future actions)
            if ($clearHistory) {
                $clone->history_hidden_before_action_id = null; // no actions yet on clone
                $clone->sales_view_reset_at = now();
                $clone->save();
            }

            // Log the action
            activity()
                ->performedOn($clone)
                ->causedBy($currentUser)
                ->withProperties([
                    'cloned_from'  => $originalLead->id,
                    'assigned_to'  => $clone->assigned_to,
                ])
                ->log('Lead cloned and assigned as fresh');

            return $clone;
        });

        // Notify new assignee
        try {
            if ($user) {
                $notification = new \App\Notifications\LeadAssigned(
                    $clonedLead->fresh(['assignedAgent:id,name', 'creator:id,name']),
                    $currentUser->name
                );
                $recipients = $this->buildNotificationRecipients(
                    $user,
                    ['assignee' => $user, 'assigner' => $currentUser],
                    'leads',
                    'notify_assigned_leads'
                );
                foreach ($recipients as $recipient) {
                    try { $recipient->notify($notification); } catch (\Throwable) {}
                }
            }
        } catch (\Throwable) {}

        return response()->json([
            'message'      => 'Lead cloned and assigned successfully',
            'cloned_lead'  => $clonedLead->fresh(['assignedAgent:id,name', 'creator:id,name']),
            'original_lead_id' => $originalLead->id,
        ]);
    }

    public function transfer(Request $request, $id)
    {
        $lead = Lead::findOrFail($id);
        $oldAssigneeId = $lead->assigned_to;
        
        // Prevent Sales Person from assigning leads
        // Role check: Sales Person cannot assign unless they have explicit permission (which they shouldn't by default)
        $user = $request->user();
        $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();
        $roleLower = strtolower($user->role ?? '');
        $isSalesPerson = str_contains($roleLower, 'sales person') || str_contains($roleLower, 'salesperson') || in_array('sales person', $roles) || in_array('salesperson', $roles);
        
        // But Sales Admin/Manager/Team Leader can.
        // If strict "Sales Person" role (and not manager/admin), deny.
        // Assuming Sales Person role doesn't have 'assign-leads' permission or we check explicitly.
        // Let's rely on role check for strict adherence to the report.
        if ($isSalesPerson && 
            !str_contains($roleLower, 'manager') && 
            !str_contains($roleLower, 'admin') && 
            !str_contains($roleLower, 'leader') && 
            !str_contains($roleLower, 'director')) {
             return response()->json(['message' => 'Sales Persons cannot assign leads.'], 403);
        }

        $request->validate([
            'assigned_to' => 'required',
            'stage' => 'required',
            'history_option' => 'required|in:keep_history,assign_as_new'
        ]);

        $newAgentId = $request->assigned_to;
        $targetStage = $request->stage; // 'same_stage', 'new_lead', 'cold_calls'
        $historyOption = $request->history_option;
        $duplicateId = $request->duplicate_id;

        DB::transaction(function() use ($lead, $newAgentId, $targetStage, $historyOption, $duplicateId, $request) {
            // Resolve User
            $user = \App\Models\User::where('id', $newAgentId)->orWhere('name', $newAgentId)->first();
            $resolvedStageId = $this->resolveSalesAssignmentStageId((int) ($lead->tenant_id ?? $request->user()?->tenant_id ?? 0), (string) $targetStage, $lead->stage_id ? (int) $lead->stage_id : null);
            
            // Scope Rule: Assignee must be in the manager's team (descendants)
            // Or self-assignment
            $currentUser = $request->user();
            if ($user && $user->id !== $currentUser->id && !$currentUser->is_super_admin) {
                 // Check if user is a descendant or managed by current user
                 // For Sales Manager, they can only assign to direct subordinates (Team Leaders, Sales Persons)
                 // We use the descendants() relationship or similar logic.
                 // Assuming descendants() is available on User model (e.g. via nested sets or recursive relationship)
                 
                 // If not using a specific package, we might check manager_id.
                 // Ideally, we trust the frontend list (which is filtered), but for strict backend enforcement:
                 $isSubordinate = false;
                 
                 // Check if target user is in the descendants list
                 if (method_exists($currentUser, 'descendants')) {
                     $isSubordinate = $currentUser->descendants()->where('id', $user->id)->exists();
                 } else {
                     // Fallback: check if target's manager is current user (direct)
                     $isSubordinate = $user->manager_id == $currentUser->id;
                 }
                 
                 // If not a subordinate, deny assignment
                 // Exception: Admin/Tenant Admin can assign to anyone
                 $roleLower = strtolower($currentUser->role ?? '');
                 $isAdmin = str_contains($roleLower, 'admin') || str_contains($roleLower, 'director') || str_contains($roleLower, 'operation manager') || str_contains($roleLower, 'branch manager'); 
                 
                 if (!$isSubordinate && !$isAdmin) {
                     // Sales Manager trying to assign outside team?
                     // Or Sales Admin trying to assign outside?
                     // If strictly following "Sales Manager can assign ONLY to team", we should block.
                     // But let's allow if they are Sales Admin/Branch Manager (broader scope).
                     
                     // If strictly Sales Manager:
                     if ($this->isSalesManager($currentUser) && !$isAdmin) {
                         abort(403, 'You can only assign leads to your team members.');
                     }
                     
                     // If Team Leader trying to assign outside team?
                     if ($this->isTeamLeader($currentUser) && !$isAdmin) {
                         abort(403, 'Team Leaders can only assign leads to their direct team members.');
                     }
                 }
            }

            if ($user) {
                $this->ensureUserCanBeAssignedLeadSource($user, $lead->source);
                $this->ensureUserCanBeAssignedLeadProject($user, $this->resolveLeadProjectLabel($lead));
                $lead->assigned_to = $user->id;
                $lead->sales_person = $user->name;
            }

            // Stage Transition Logic
            if ($targetStage === 'new_lead') {
                $lead->stage = 'New Lead';
                // Assignment workflow: any assigned lead starts as Pending until the assignee takes the first action
                $lead->status = $user ? 'pending' : 'new';
            } elseif ($targetStage === 'cold_calls') {
                $lead->stage = 'Cold Calls';
                // Assignment workflow: any assigned lead starts as Pending until the assignee takes the first action
                $lead->status = $user ? 'pending' : 'new';
            } elseif ($targetStage === 'same_stage') {
                // Keep current stage and status
                // But ensure it's not "duplicate" anymore if we're resolving it
                if (strtolower($lead->status) === 'duplicate') {
                    $lead->status = 'new';
                }
                if (strtolower($lead->stage) === 'duplicate') {
                    $lead->stage = 'New Lead';
                }
            } else {
                // Default fallback if something else is sent
                $lead->stage = 'New Lead';
                $lead->status = 'new';
            }

            if (!empty($resolvedStageId)) {
                $lead->stage_id = (int) $resolvedStageId;
            }

            // If resolving a duplicate via transfer
            if ($duplicateId) {
                $duplicateLead = Lead::find($duplicateId);
                if ($duplicateLead) {
                    // Move actions from duplicate to original
                    \App\Models\LeadAction::where('lead_id', $duplicateLead->id)
                        ->update(['lead_id' => $lead->id]);
                    
                    // Move activities
                    \Spatie\Activitylog\Models\Activity::where('subject_type', Lead::class)
                        ->where('subject_id', $duplicateLead->id)
                        ->update(['subject_id' => $lead->id]);

                    // Delete the duplicate
                    $duplicateLead->delete();
                }
            }

            $lead->save();

            // Handle History Visibility
            // Clear History is an independent visibility flag — it does NOT affect stage or status.
            // Stage was already set above based on $targetStage (new_lead / cold_calls / same_stage).
            if ($historyOption === 'assign_as_new') {
                // Keep all history in DB; just hide old actions from the new assignee's view.
                // Managers and higher roles still see the full history.
                $lastActionId = \App\Models\LeadAction::where('lead_id', $lead->id)->max('id');
                $lead->history_hidden_before_action_id = $lastActionId ?: null;
                $lead->sales_view_reset_at = now();
                // ⚠️ Do NOT force stage here — stage was already resolved above via $targetStage.
                $lead->save();
            } else {
                // Keep history fully visible for the new assignee
                $lead->history_hidden_before_action_id = null;
                $lead->sales_view_reset_at = null;
                $lead->save();
            }
            
            // Log the transfer
            activity()
               ->performedOn($lead)
               ->causedBy($request->user())
               ->withProperties(['old' => ['assigned_to' => $lead->getOriginal('assigned_to')], 'attributes' => ['assigned_to' => $lead->assigned_to]])
               ->log('Lead transferred');
        });

        // Notify assignee (and configured recipients) when reassigned via transfer
        try {
            if ($lead->assigned_to && (string) $lead->assigned_to !== (string) $oldAssigneeId) {
                $assignee = User::with(['manager', 'team.leader'])->find($lead->assigned_to);
                $actor = $request->user();
                if ($assignee && $actor) {
                    $leadFresh = $lead->fresh(['assignedAgent:id,name', 'creator:id,name']);
                    $notification = new \App\Notifications\LeadAssigned($leadFresh, $actor->name);
                    $previousOwner = $oldAssigneeId ? User::find($oldAssigneeId) : null;
                    $recipients = $this->buildNotificationRecipients(
                        $assignee,
                        [
                            'owner' => $leadFresh?->creator,
                            'assignee' => $assignee,
                            'assigner' => $actor,
                            'previous_owner' => $previousOwner,
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
        } catch (\Throwable $e) {
        }

        return response()->json(['message' => 'Lead transferred successfully', 'lead' => $lead->fresh(['assignedAgent:id,name', 'creator:id,name'])]);
    }

    /**
     * Apply stage filtering logic consistently.
     * 
     * @param \Illuminate\Database\Eloquent\Builder $query
     * @param array|string $stages
     * @param \App\Models\User $user
     * @return \Illuminate\Database\Eloquent\Builder
     */
    protected function isSalesManager($user): bool
    {
        if (!$user) return false;
        $roleLower = strtolower($user->role ?? '');
        return str_contains($roleLower, 'sales manager');
    }

    protected function isTeamLeader($user): bool
    {
        if (!$user) return false;
        $roleLower = strtolower($user->role ?? '');
        return str_contains($roleLower, 'team leader');
    }

    private function applyStageFilter($query, $stages, $user, ?Request $request = null)
    {
        $stages = (array)$stages;
        $request ??= request();
        $stageVisibility = $this->resolveLeadStageVisibilityContext($request, $user);
        $displayStageSql = $this->buildLeadDisplayStageSql($stageVisibility);
        $normalizedDisplayStageExpr = DB::raw("lower(trim(coalesce(({$displayStageSql}), '')))");

        $expandedTargets = [];
        foreach ($stages as $stage) {
            $value = strtolower(trim((string) $stage));
            if ($value === '' || $value === 'duplicate') {
                continue;
            }

            if (in_array($value, ['new', 'new lead', 'fresh'], true)) {
                $expandedTargets[] = 'new';
                $expandedTargets[] = 'new lead';
                continue;
            }

            if (in_array($value, ['pending', 'in-progress', 'assigned'], true)) {
                $expandedTargets[] = 'pending';
                if (!empty($stageVisibility['hasSalesPersonFilter'])) {
                    $expandedTargets[] = 'in-progress';
                }
                continue;
            }

            if (in_array($value, ['coldcalls', 'cold calls', 'cold-call', 'cold_call', 'cold_calls', 'cold call'], true)) {
                $expandedTargets[] = 'coldcalls';
                $expandedTargets[] = 'cold calls';
                $expandedTargets[] = 'cold-call';
                $expandedTargets[] = 'cold_call';
                $expandedTargets[] = 'cold_calls';
                $expandedTargets[] = 'cold call';
                continue;
            }

            $expandedTargets[] = $value;
        }

        $expandedTargets = array_values(array_unique($expandedTargets));
        if (empty($expandedTargets)) {
            return $query;
        }

        return $query->whereIn($normalizedDisplayStageExpr, $expandedTargets);
    }
}
