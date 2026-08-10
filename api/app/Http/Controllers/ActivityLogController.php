<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\LeadAction;
use App\Models\Lead;
use App\Models\LeadWorkflowHistory;
use App\Models\SharedUser;
use App\Models\Tenant;
use App\Models\User;
use App\Services\TelesalesService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ActivityLogController extends Controller
{
    use \App\Traits\UserHierarchyTrait;

    private function formatStageReportLabels($stage, ?string $fallback = null, ?string $fallbackArabic = null): array
    {
        $en = null;
        $ar = null;

        if ($stage) {
            $en = $stage->name ?: $stage->type ?: null;
            $ar = $stage->name_ar ?: null;
        }

        $en = $en ?: ($fallback ?: null);
        $ar = $ar ?: ($fallbackArabic ?: null);

        if (!$ar) {
            $ar = $en;
        }

        if (!$en) {
            $en = $ar;
        }

        return [
            'en' => $en,
            'ar' => $ar,
        ];
    }

    protected function applyGeneralDashboardLeadWorkflowScope($query, string $qualifiedColumn = 'workflow_key'): void
    {
        $query->where(function ($workflowQuery) use ($qualifiedColumn) {
            $workflowQuery->where($qualifiedColumn, TelesalesService::WORKFLOW_SALES)
                ->orWhereNull($qualifiedColumn)
                ->orWhere($qualifiedColumn, '');
        });
    }

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

    protected function resolveCauserIdentity(Activity $activity): array
    {
        $causer = $activity->causer;

        if ($causer && ($causer->name || $causer->email)) {
            return [
                'name' => $causer->name,
                'email' => $causer->email,
                'role' => $causer->job_title ?: $causer->role,
            ];
        }

        $properties = $this->normalizeActivityProperties($activity->properties);
        $fallbackName = data_get($properties, 'causer.name')
            ?: data_get($properties, 'user.name')
            ?: data_get($properties, 'userName');
        $fallbackEmail = data_get($properties, 'causer.email')
            ?: data_get($properties, 'user.email')
            ?: data_get($properties, 'userEmail');
        $fallbackRole = data_get($properties, 'causer.role')
            ?: data_get($properties, 'user.role');

        if ($fallbackName || $fallbackEmail || $fallbackRole) {
            return [
                'name' => $fallbackName,
                'email' => $fallbackEmail,
                'role' => $fallbackRole,
            ];
        }

        if (!$activity->causer_id || !in_array($activity->causer_type, $this->userMorphTypes(), true)) {
            return ['name' => null, 'email' => null, 'role' => null];
        }

        return $this->resolveCauserFromTenantContext($activity);
    }

    protected function resolveCauserFromTenantContext(Activity $activity): array
    {
        $tenantId = (int) ($activity->tenant_id ?: 0);
        if ($tenantId <= 0) {
            return ['name' => null, 'email' => null, 'role' => null];
        }

        $tenant = Tenant::query()->find($tenantId);
        if (!$tenant) {
            return ['name' => null, 'email' => null, 'role' => null];
        }

        $hadCurrentTenantId = app()->bound('current_tenant_id');
        $previousCurrentTenantId = $hadCurrentTenantId ? app('current_tenant_id') : null;
        $hadTenantBinding = app()->bound('tenant');
        $previousTenant = $hadTenantBinding ? app('tenant') : null;
        $previousCurrentTenant = method_exists(Tenant::class, 'current') ? Tenant::current() : null;

        try {
            $tenant->makeCurrent();

            $userQuery = User::withoutGlobalScopes()
                ->whereKey($activity->causer_id);

            if ($tenantId > 0) {
                $userQuery->where('tenant_id', $tenantId);
            }

            $user = $userQuery->first();

            return [
                'name' => $user?->name,
                'email' => $user?->email,
                'role' => $user?->job_title ?: $user?->role,
            ];
        } catch (\Throwable $e) {
            return ['name' => null, 'email' => null, 'role' => null];
        } finally {
            Tenant::forgetCurrent();

            if ($previousCurrentTenant) {
                $previousCurrentTenant->makeCurrent();
            } else {
                if ($hadCurrentTenantId) {
                    app()->instance('current_tenant_id', $previousCurrentTenantId);
                } else {
                    app()->forgetInstance('current_tenant_id');
                }

                if ($hadTenantBinding) {
                    app()->instance('tenant', $previousTenant);
                } else {
                    app()->forgetInstance('tenant');
                }
            }
        }
    }

    protected function tenantConnectionName(): string
    {
        if (app()->bound('tenant') && app('tenant')) {
            return app('tenant')->tenancy_type === 'dedicated'
                ? config('multitenancy.tenant_database_connection_name', 'tenant-dedicated')
                : config('database.default', 'mysql');
        }

        return config('database.default', 'mysql');
    }

    protected function tenantConnection()
    {
        return DB::connection($this->tenantConnectionName());
    }

    protected function tenantSchema()
    {
        return Schema::connection($this->tenantConnectionName());
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        if (!$request->user()->is_super_admin) {
            abort(403, 'Unauthorized');
        }

        $query = Activity::query()->with(['causer', 'tenant']);

        // Filtering
        if ($request->has('tenant_id')) {
            $query->where('tenant_id', $request->tenant_id);
        }
        if ($request->has('user_id')) {
            $query->where('causer_id', $request->user_id)
                ->whereIn('causer_type', $this->userMorphTypes());
        }
        if ($request->has('log_name')) {
            $query->where('log_name', $request->log_name);
        }
        if ($request->has('subject_type')) {
            $query->where('subject_type', $request->subject_type);
        }
        if ($request->has('event')) {
            $query->where('event', $request->event);
        }
        if ($request->has('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }
        if ($request->has('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                    ->orWhere('properties', 'like', "%{$search}%");
            });
        }

        // Sorting
        $sortField = $request->input('sort_by', 'created_at');
        $sortDirection = $request->input('sort_dir', 'desc');
        $query->orderBy($sortField, $sortDirection);

        // Pagination
        $perPage = min($request->input('per_page', 50), 500); // Max 500
        $logs = $query->paginate($perPage);
        $logs->getCollection()->transform(function (Activity $activity) {
            $causerIdentity = $this->resolveCauserIdentity($activity);
            $tenant = $activity->tenant;
            $properties = $this->normalizeActivityProperties($activity->properties);
            $description = $this->buildAuditDescription($activity, $properties);

            return [
                'id' => (int) $activity->id,
                'log_name' => $activity->log_name,
                'description' => $activity->description,
                'description_summary' => $description['summary'],
                'description_details' => $description['details'],
                'subject_type' => $activity->subject_type,
                'subject_id' => $activity->subject_id,
                'event' => $activity->event,
                'causer_id' => $activity->causer_id,
                'causer_type' => $activity->causer_type,
                'causer_name' => $causerIdentity['name'],
                'causer_email' => $causerIdentity['email'],
                'causer_role' => $causerIdentity['role'],
                'tenant_id' => $activity->tenant_id,
                'tenant_name' => $tenant?->name,
                'tenant_domain' => $tenant?->domain ?: $tenant?->slug,
                'properties' => $properties,
                'created_at' => optional($activity->created_at)->toISOString(),
                'updated_at' => optional($activity->updated_at)->toISOString(),
            ];
        });

        return response()->json($logs);
    }

    protected function normalizeActivityProperties($properties): array
    {
        if (is_string($properties)) {
            $decoded = json_decode($properties, true);
            return is_array($decoded) ? $decoded : [];
        }

        if (is_object($properties) && method_exists($properties, 'toArray')) {
            return $properties->toArray();
        }

        return is_array($properties) ? $properties : [];
    }

    protected function buildAuditDescription(Activity $activity, array $properties): array
    {
        $summary = trim((string) ($activity->description ?: 'Activity recorded.'));
        $details = [];
        $subjectLabel = $this->resolveSubjectLabel($activity, $properties);

        if ($subjectLabel !== '') {
            $details[] = 'Target: ' . $subjectLabel;
        }

        $old = is_array($properties['old'] ?? null) ? $properties['old'] : [];
        $attributes = is_array($properties['attributes'] ?? null) ? $properties['attributes'] : [];

        if ($activity->log_name === 'super_admin') {
            [$summary, $details] = $this->buildSuperAdminDescription($activity, $properties, $summary, $details);
        } elseif ($activity->subject_type === \App\Models\Tenant::class || str_contains(strtolower((string) $activity->description), 'tenant')) {
            [$summary, $details] = $this->buildTenantDescription($activity, $properties, $summary, $details);
        } elseif (!empty($old) || !empty($attributes)) {
            $changes = $this->summarizeFieldChanges($old, $attributes);
            if ($changes !== []) {
                $details[] = 'Changes: ' . implode('; ', $changes);
            }
        }

        $ip = $properties['ip'] ?? ($properties['ip_address'] ?? null);
        if ($ip) {
            $details[] = 'IP: ' . $ip;
        }

        $userAgent = $properties['user_agent'] ?? null;
        if ($userAgent) {
            $details[] = 'User agent: ' . $userAgent;
        }

        return [
            'summary' => $summary,
            'details' => implode("\n", array_values(array_filter($details))),
        ];
    }

    protected function buildSuperAdminDescription(Activity $activity, array $properties, string $fallbackSummary, array $details): array
    {
        $entity = data_get($properties, 'user.name')
            ?: data_get($properties, 'role.name')
            ?: $this->resolveSubjectLabel($activity, $properties);

        if ($activity->description === 'super_admin_user_created') {
            $role = data_get($properties, 'user.role');
            $email = data_get($properties, 'user.email');
            $summary = 'Created super admin user ' . ($entity ?: 'Unknown user');
            if ($role) {
                $summary .= ' with role ' . $role;
            }
            if ($email) {
                $details[] = 'Email: ' . $email;
            }
            $permissions = data_get($properties, 'user.permissions', []);
            if (is_array($permissions) && $permissions !== []) {
                $details[] = 'Permissions: ' . implode(', ', $permissions);
            }
            return [$summary . '.', $details];
        }

        if ($activity->description === 'super_admin_user_updated') {
            $changes = $this->summarizeFieldChanges(
                is_array($properties['old'] ?? null) ? $properties['old'] : [],
                is_array($properties['attributes'] ?? null) ? $properties['attributes'] : []
            );
            $summary = 'Updated super admin user ' . ($entity ?: 'Unknown user') . '.';
            if ($changes !== []) {
                $details[] = 'Changes: ' . implode('; ', $changes);
            }
            return [$summary, $details];
        }

        if ($activity->description === 'super_admin_user_deleted') {
            $summary = 'Deleted super admin user ' . ($entity ?: 'Unknown user') . '.';
            $email = data_get($properties, 'user.email');
            if ($email) {
                $details[] = 'Email: ' . $email;
            }
            return [$summary, $details];
        }

        if ($activity->description === 'super_admin_role_created') {
            return ['Created system role ' . ($entity ?: 'Unknown role') . '.', $details];
        }

        if ($activity->description === 'super_admin_role_updated') {
            $changes = $this->summarizeFieldChanges(
                is_array($properties['old'] ?? null) ? $properties['old'] : [],
                is_array($properties['attributes'] ?? null) ? $properties['attributes'] : []
            );
            if (($affectedUsers = $properties['affected_users'] ?? []) && is_array($affectedUsers)) {
                $details[] = 'Affected users: ' . implode(', ', $affectedUsers);
            }
            if ($changes !== []) {
                $details[] = 'Changes: ' . implode('; ', $changes);
            }
            return ['Updated system role ' . ($entity ?: 'Unknown role') . '.', $details];
        }

        if ($activity->description === 'super_admin_role_deleted') {
            return ['Deleted system role ' . ($entity ?: 'Unknown role') . '.', $details];
        }

        if ($activity->description === 'subscription_transaction_created') {
            $transaction = is_array($properties['transaction'] ?? null) ? $properties['transaction'] : [];
            $summary = 'Recorded subscription transaction #' . ($transaction['id'] ?? $activity->subject_id) . '.';
            if (!empty($transaction['type'])) {
                $details[] = 'Type: ' . $transaction['type'];
            }
            if (isset($transaction['total_amount'], $transaction['currency'])) {
                $details[] = 'Amount: ' . $transaction['total_amount'] . ' ' . $transaction['currency'];
            }
            return [$summary, $details];
        }

        if ($activity->description === 'subscription_transaction_updated') {
            $changes = $this->summarizeFieldChanges(
                is_array($properties['old'] ?? null) ? $properties['old'] : [],
                is_array($properties['attributes'] ?? null) ? $properties['attributes'] : []
            );
            if ($changes !== []) {
                $details[] = 'Changes: ' . implode('; ', $changes);
            }
            return ['Updated subscription transaction #' . ($activity->subject_id ?: 'Unknown') . '.', $details];
        }

        if ($activity->description === 'subscription_transaction_voided') {
            $reason = $properties['reason'] ?? null;
            if ($reason) {
                $details[] = 'Reason: ' . $reason;
            }
            return ['Voided subscription transaction #' . ($activity->subject_id ?: 'Unknown') . '.', $details];
        }

        if ($activity->description === 'tenant_subscription_contract_created') {
            $contract = is_array($properties['contract'] ?? null) ? $properties['contract'] : [];
            $summary = 'Created tenant subscription contract #' . ($contract['id'] ?? $activity->subject_id) . '.';
            if (!empty($contract['plan_code'])) {
                $details[] = 'Plan: ' . $contract['plan_code'];
            }
            if (isset($contract['agreed_amount'])) {
                $details[] = 'Agreed amount: ' . $contract['agreed_amount'];
            }
            return [$summary, $details];
        }

        return [$fallbackSummary, $details];
    }

    protected function buildTenantDescription(Activity $activity, array $properties, string $fallbackSummary, array $details): array
    {
        $tenantName = $this->resolveSubjectLabel($activity, $properties) ?: ('Tenant #' . ($activity->tenant_id ?: $activity->subject_id));
        $event = strtolower((string) $activity->event);
        $old = is_array($properties['old'] ?? null) ? $properties['old'] : [];
        $attributes = is_array($properties['attributes'] ?? null) ? $properties['attributes'] : [];

        if ($event === 'created') {
            $summary = 'Created tenant ' . $tenantName . '.';
            $domain = $attributes['domain'] ?? null;
            $status = $attributes['status'] ?? null;
            if ($domain) {
                $details[] = 'Domain: ' . $domain;
            }
            if ($status) {
                $details[] = 'Status: ' . $status;
            }
            return [$summary, $details];
        }

        if ($event === 'updated') {
            $changes = $this->summarizeFieldChanges($old, $attributes);
            $summary = 'Updated tenant ' . $tenantName . '.';
            if ($changes !== []) {
                $details[] = 'Changes: ' . implode('; ', $changes);
            }
            return [$summary, $details];
        }

        if ($event === 'deleted') {
            return ['Deleted tenant ' . $tenantName . '.', $details];
        }

        return [$fallbackSummary, $details];
    }

    protected function summarizeFieldChanges(array $old, array $attributes): array
    {
        $changes = [];
        $keys = collect(array_unique(array_merge(array_keys($old), array_keys($attributes))))
            ->reject(fn ($key) => in_array($key, ['updated_at', 'created_at', 'password', 'remember_token'], true))
            ->values();

        foreach ($keys as $key) {
            $oldValue = $old[$key] ?? null;
            $newValue = $attributes[$key] ?? null;

            if ($oldValue == $newValue) {
                continue;
            }

            if (is_array($oldValue) || is_array($newValue)) {
                $oldArray = is_array($oldValue) ? $oldValue : [];
                $newArray = is_array($newValue) ? $newValue : [];
                $added = array_values(array_diff($newArray, $oldArray));
                $removed = array_values(array_diff($oldArray, $newArray));

                if ($added !== []) {
                    $changes[] = $this->humanizeFieldName($key) . ' added [' . implode(', ', $added) . ']';
                }
                if ($removed !== []) {
                    $changes[] = $this->humanizeFieldName($key) . ' removed [' . implode(', ', $removed) . ']';
                }
                continue;
            }

            $changes[] = $this->humanizeFieldName($key) . ' changed from "' . $this->stringifyAuditValue($oldValue) . '" to "' . $this->stringifyAuditValue($newValue) . '"';
        }

        return $changes;
    }

    protected function resolveSubjectLabel(Activity $activity, array $properties): string
    {
        return (string) (
            data_get($properties, 'attributes.name')
            ?: data_get($properties, 'user.name')
            ?: data_get($properties, 'role.name')
            ?: data_get($properties, 'tenant.name')
            ?: $activity->tenant?->name
            ?: (class_basename((string) $activity->subject_type) . ($activity->subject_id ? ' #' . $activity->subject_id : ''))
        );
    }

    protected function humanizeFieldName(string $field): string
    {
        return ucfirst(str_replace('_', ' ', $field));
    }

    protected function stringifyAuditValue($value): string
    {
        if ($value === null || $value === '') {
            return 'empty';
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        if (is_array($value)) {
            return implode(', ', array_map(fn ($item) => $this->stringifyAuditValue($item), $value));
        }

        return (string) $value;
    }

    public function tenantLogs(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthorized');
        }

        $roleLower = strtolower($user->role ?? '');
        $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();

        // Check for privileged roles using string matching to handle variations
        $isAdmin = str_contains($roleLower, 'admin') || collect($roles)->contains(fn($r) => str_contains($r, 'admin'));
        $isManager = str_contains($roleLower, 'manager') || collect($roles)->contains(fn($r) => str_contains($r, 'manager')); // Covers 'sales manager', 'operation manager'
        $isDirector = str_contains($roleLower, 'director') || collect($roles)->contains(fn($r) => str_contains($r, 'director'));
        $isTeamLeader = str_contains($roleLower, 'team leader') || collect($roles)->contains(fn($r) => str_contains($r, 'team leader'));

        $isPrivileged = $user->is_super_admin
            || $user->can('view-reports')
            || $isAdmin
            || $isManager
            || $isDirector
            || $isTeamLeader;

        if (!$isPrivileged) {
            abort(403, 'Unauthorized');
        }

        $tenantId = $user->tenant_id;

        $query = Activity::with('causer');

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        // Apply Hierarchy Filtering
        $viewableIds = $this->getViewableUserIds($user);
        if ($viewableIds !== null) {
            $query->whereIn('causer_id', $viewableIds);
        }

        $perPage = min((int)$request->input('per_page', 500), 1000);

        $logs = $query
            ->orderByDesc('created_at')
            ->limit($perPage)
            ->get();

        $data = $logs->map(function (Activity $activity) {
            $props = $activity->properties;
            if (is_string($props)) {
                $decoded = json_decode($props, true);
                $props = is_array($decoded) ? $decoded : [];
            }
            elseif (!is_array($props)) {
                $props = (array)$props;
            }

            $ip = $props['ip'] ?? ($props['ip_address'] ?? null);
            $module = $this->mapModule($activity);
            $type = $this->mapType($activity);
            $target = $this->buildTarget($activity);
            $causer = $activity->causer;

            return [
            'id' => (int)$activity->id,
            'type' => $type,
            'user' => $causer ? $causer->name : 'System',
            'target' => $target,
            'description' => $activity->description,
            'ts' => $activity->created_at ? $activity->created_at->format('Y-m-d H:i') : null,
            'ip' => $ip,
            'module' => $module,
            ];
        });

        return response()->json($data);
    }

    /**
     * Top agents by number of actions on their own leads.
     */
    public function topAgents(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthorized');
        }
        $tenantId = $user->tenant_id;

        $range = strtolower($request->input('range', 'all'));
        $dateFrom = null;
        $dateTo = now();
        if ($range === 'today') {
            $dateFrom = now()->startOfDay();
            $dateTo = now()->endOfDay();
        }
        elseif ($range === 'weekly') {
            $dateFrom = now()->subDays(6)->startOfDay();
            $dateTo = now()->endOfDay();
        }
        elseif ($range === 'monthly') {
            $dateFrom = now()->startOfMonth();
            $dateTo = now()->endOfMonth();
        }
        else {
            $dateFrom = null;
            $dateTo = null;
        }

        $query = $this->tenantConnection()->table('activity_log')
            ->join('leads', function ($join) {
            $join->on('leads.id', '=', 'activity_log.subject_id');
        })
            ->join('users', function ($join) {
            $join->on('users.id', '=', 'activity_log.causer_id');
        })
            ->where('activity_log.subject_type', '=', Lead::class)
            ->whereNotNull('activity_log.causer_id')
            ->whereIn('activity_log.causer_type', $this->userMorphTypes())
            ->whereColumn('leads.assigned_to', 'activity_log.causer_id');

        if ($tenantId) {
            $query->where('activity_log.tenant_id', $tenantId)
                ->where('leads.tenant_id', $tenantId)
                ->where('users.tenant_id', $tenantId);
        }
        $this->applyGeneralDashboardLeadWorkflowScope($query, 'leads.workflow_key');
        if ($dateFrom && $dateTo) {
            $query->whereBetween('activity_log.created_at', [$dateFrom, $dateTo]);
        }

        $result = $query
            ->groupBy('activity_log.causer_id', 'users.name')
            ->selectRaw('activity_log.causer_id as user_id, users.name as name, COUNT(*) as actions_count')
            ->orderByDesc('actions_count')
            ->limit(10)
            ->get();

        $data = $result->map(function ($row, $index) {
            return [
            'id' => (int)$row->user_id,
            'name' => $row->name,
            'score' => (int)$row->actions_count,
            'isCrowned' => $index === 0,
            'avatar' => null,
            ];
        });

        return response()->json($data);
    }

    protected function collectSubordinatesIds(User $root): array
    {
        $ids = [];
        $all = User::where('tenant_id', $root->tenant_id)->get(['id', 'manager_id', 'tenant_id']);
        $byManager = [];
        foreach ($all as $u) {
            $byManager[$u->manager_id ?? 0][] = $u;
        }
        $queue = [$root->id];
        $visited = [];
        while (!empty($queue)) {
            $current = array_shift($queue);
            if (isset($visited[$current])) {
                continue;
            }
            $visited[$current] = true;
            $children = $byManager[$current] ?? [];
            foreach ($children as $child) {
                $ids[] = (int)$child->id;
                $queue[] = (int)$child->id;
            }
        }
        return $ids;
    }

    public function lastComments(Request $request)
    {
        $user = $request->user();
        if (!$user)
            abort(401, 'Unauthorized');
        $tenantId = $user->tenant_id;
        $employeeIds = $request->input('employee_ids', []);
        if (!is_array($employeeIds))
            $employeeIds = [];
        $managerId = $request->input('manager_id');
        $rangeFrom = $request->input('date_from');
        $rangeTo = $request->input('date_to');
        $ids = [];
        $shouldFilter = false;
        if (!empty($employeeIds)) {
            $ids = array_map('intval', $employeeIds);
        }
        else {
            $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();
            $roleLower = strtolower($user->role ?? '');
            $isSalesPerson = str_contains($roleLower, 'sales person') || str_contains($roleLower, 'salesperson') || in_array('sales person', $roles) || in_array('salesperson', $roles);
            $isTeamLeader = str_contains($roleLower, 'team leader') || in_array('team leader', $roles);

            if ($isSalesPerson) {
                $ids = [(int)$user->id];
                $shouldFilter = true;
            }
            elseif ($isTeamLeader) {
                $ids = $this->collectSubordinatesIds($user);
                $ids[] = (int)$user->id;
                $shouldFilter = true;
            }
            elseif (!empty($managerId)) {
                $root = User::where('tenant_id', $tenantId)->find($managerId);
                if ($root) {
                    $ids = $this->collectSubordinatesIds($root);
                    $ids[] = (int)$root->id;
                    $shouldFilter = true;
                }
            }
        }
        
        $query = LeadAction::with(['lead.assignedAgent', 'user'])
            ->where('tenant_id', $tenantId)
            ->whereHas('lead', function ($leadQuery) {
                $this->applyGeneralDashboardLeadWorkflowScope($leadQuery, 'workflow_key');
            });

        if ($shouldFilter) {
            $query->whereIn('user_id', $ids);
        }
        if (!empty($ids) && !$shouldFilter) { // If ids were provided manually via employee_ids
            $query->whereIn('user_id', $ids);
        }
        if (!empty($rangeFrom)) {
            $query->whereDate('created_at', '>=', $rangeFrom);
        }
        if (!empty($rangeTo)) {
            $query->whereDate('created_at', '<=', $rangeTo);
        }

        $rows = $query->orderByDesc('created_at')
            ->limit(50)
            ->get();

        $data = $rows->map(function ($action) {
            $details = $action->details ?? [];
            $salesPerson = $action->lead && $action->lead->assignedAgent ? $action->lead->assignedAgent->name : null;
            
            // Fallback for sales person name if assignedAgent is null (try assigned_to if it's string, or just Unassigned)
            if (!$salesPerson && $action->lead && $action->lead->assigned_to) {
                 // Check if assigned_to is numeric ID but relation failed (deleted user?) or just a string name legacy
                 if (!is_numeric($action->lead->assigned_to)) {
                     $salesPerson = $action->lead->assigned_to;
                 }
            }

            return [
                'id' => $action->id,
                'employeeName' => $salesPerson ?: 'Unassigned',
                'actionBy' => $action->user ? $action->user->name : 'System',
                'leadName' => $action->lead ? $action->lead->name : ('Lead #' . $action->lead_id),
                'leadId' => $action->lead_id,
                'comment' => $action->description,
                'priority' => $details['priority'] ?? null,
                'type' => $action->action_type,
                'stage' => $action->lead ? $action->lead->stage : null,
                'status' => $action->lead ? $action->lead->status : null,
                'source' => $action->lead ? $action->lead->source : null,
                'createdAt' => $action->created_at->toIso8601String(),
            ];
        });
        
        return response()->json($data);
    }

    public function recentPhoneCalls(Request $request)
    {
        $user = $request->user();
        if (!$user)
            abort(401, 'Unauthorized');
        $tenantId = $user->tenant_id;
        $employeeIds = $request->input('employee_ids', []);
        if (!is_array($employeeIds))
            $employeeIds = [];
        $managerId = $request->input('manager_id');
        $rangeFrom = $request->input('date_from');
        $rangeTo = $request->input('date_to');
        $ids = [];
        $shouldFilter = false;
        if (!empty($employeeIds)) {
            $ids = array_map('intval', $employeeIds);
        }
        else {
            $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();
            $roleLower = strtolower($user->role ?? '');
            $isSalesPerson = str_contains($roleLower, 'sales person') || str_contains($roleLower, 'salesperson') || in_array('sales person', $roles) || in_array('salesperson', $roles);
            $isTeamLeader = str_contains($roleLower, 'team leader') || in_array('team leader', $roles);

            $shouldFilter = false;

            if ($isSalesPerson) {
                $ids = [(int)$user->id];
                $shouldFilter = true;
            }
            elseif ($isTeamLeader) {
                $ids = $this->collectSubordinatesIds($user);
                $ids[] = (int)$user->id;
                $shouldFilter = true;
            }
            elseif (!empty($managerId)) {
                $root = User::where('tenant_id', $tenantId)->find($managerId);
                if ($root) {
                    $ids = $this->collectSubordinatesIds($root);
                    $ids[] = (int)$root->id;
                    $shouldFilter = true;
                }
            }
        }
        
        $query = LeadAction::with(['lead', 'user'])
            ->where('tenant_id', $tenantId)
            ->where('action_type', 'call')
            ->whereHas('lead', function ($leadQuery) {
                $this->applyGeneralDashboardLeadWorkflowScope($leadQuery, 'workflow_key');
            });

        if ($shouldFilter) {
            $query->whereIn('user_id', $ids);
        }
        if (!empty($ids) && !$shouldFilter) {
            $query->whereIn('user_id', $ids);
        }
        if (!empty($rangeFrom)) {
            $query->whereDate('created_at', '>=', $rangeFrom);
        }
        if (!empty($rangeTo)) {
            $query->whereDate('created_at', '<=', $rangeTo);
        }

        $rows = $query->orderByDesc('created_at')
            ->limit(50)
            ->get();

        $data = $rows->map(function ($action) {
            $details = $action->details ?? [];
            $lead = $action->lead;
            $phoneNumber = $details['phone']
                ?? $details['phone_number']
                ?? $details['mobile']
                ?? ($lead->phone ?? null)
                ?? ($lead->mobile ?? null);
            $phoneCountry = $details['phone_country']
                ?? $details['phoneCountry']
                ?? ($lead->phone_country ?? null)
                ?? ($lead->phoneCountry ?? null)
                ?? ($lead->meta_data['phone_country'] ?? null)
                ?? ($lead->meta_data['phoneCountry'] ?? null);

            return [
                'id' => $action->id,
                'employeeName' => $action->user ? $action->user->name : 'System',
                'leadName' => $lead ? $lead->name : ('Lead #' . $action->lead_id),
                'leadId' => $action->lead_id,
                'phoneNumber' => $phoneNumber,
                'phoneCountry' => $phoneCountry,
                'callType' => $details['call_type'] ?? ($details['type'] ?? 'call'),
                'duration' => $details['duration'] ?? '00:00',
                'notes' => $details['notes'] ?? ($action->description ?? ''),
                'createdAt' => $action->created_at->toIso8601String(),
            ];
        });
        
        return response()->json($data);
    }

    public function salesToTelesalesTransfers(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthorized');
        }

        $tenantId = (int) $user->tenant_id;
        $employeeIds = $request->input('employee_ids', []);
        if (!is_array($employeeIds)) {
            $employeeIds = [];
        }

        $managerId = $request->input('manager_id');
        $rangeFrom = $request->input('date_from');
        $rangeTo = $request->input('date_to');
        $ids = [];
        $shouldFilter = false;

        if (!empty($employeeIds)) {
            $ids = array_values(array_unique(array_map('intval', $employeeIds)));
        } else {
            $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();
            $roleLower = strtolower($user->role ?? '');
            $isSalesPerson = str_contains($roleLower, 'sales person')
                || str_contains($roleLower, 'salesperson')
                || in_array('sales person', $roles, true)
                || in_array('salesperson', $roles, true);
            $isTeamLeader = str_contains($roleLower, 'team leader') || in_array('team leader', $roles, true);

            if ($isSalesPerson) {
                $ids = [(int) $user->id];
                $shouldFilter = true;
            } elseif ($isTeamLeader) {
                $ids = $this->collectSubordinatesIds($user);
                $ids[] = (int) $user->id;
                $shouldFilter = true;
            } elseif (!empty($managerId)) {
                $root = User::where('tenant_id', $tenantId)->find($managerId);
                if ($root) {
                    $ids = $this->collectSubordinatesIds($root);
                    $ids[] = (int) $root->id;
                    $shouldFilter = true;
                }
            }
        }

        $fromAssignedExpression = $this->metaJsonTextExpression('meta_data', 'from_assigned_to');

        $query = LeadWorkflowHistory::with([
            'lead.assignedAgent:id,name',
            'lead.creator:id,name',
            'lead.stageRelation:id,name,name_ar,type,workflow_key',
            'performedByUser:id,name',
            'fromStage:id,name,name_ar,type,workflow_key',
            'toStage:id,name,name_ar,type,workflow_key',
        ])
            ->where('tenant_id', $tenantId)
            ->where('action', 'transfer_to_telesales');

        if ($shouldFilter && !empty($ids)) {
            $query->where(function ($historyQuery) use ($ids, $fromAssignedExpression) {
                $historyQuery->whereIn('performed_by', $ids);
                foreach ($ids as $id) {
                    $historyQuery->orWhereRaw("{$fromAssignedExpression} = ?", [(string) $id]);
                }
            });
        }

        if (!empty($ids) && !$shouldFilter) {
            $query->where(function ($historyQuery) use ($ids, $fromAssignedExpression) {
                $historyQuery->whereIn('performed_by', $ids);
                foreach ($ids as $id) {
                    $historyQuery->orWhereRaw("{$fromAssignedExpression} = ?", [(string) $id]);
                }
            });
        }

        if (!empty($rangeFrom)) {
            $query->whereDate('created_at', '>=', $rangeFrom);
        }
        if (!empty($rangeTo)) {
            $query->whereDate('created_at', '<=', $rangeTo);
        }

        $rows = $query->orderByDesc('created_at')
            ->limit(50)
            ->get();

        $data = $rows->map(function (LeadWorkflowHistory $history) {
            $meta = is_array($history->meta_data ?? null) ? ($history->meta_data ?? []) : [];
            $lead = $history->lead;
            $leadMeta = is_array($lead?->meta_data ?? null) ? ($lead->meta_data ?? []) : [];

            $fallbackStageKey = strtolower(trim((string) ($meta['target_stage_key'] ?? '')));
            [$inferredFromStageLabelEn, $inferredFromStageLabelAr] = match ($fallbackStageKey) {
                'cold_calls' => ['Cold Calls', 'العملاء المحتملين'],
                'new_lead' => ['New', 'جديد'],
                default => [null, null],
            };

            $fromStageLabels = $this->formatStageReportLabels(
                $history->fromStage,
                $meta['from_stage_label_en'] ?? $meta['from_stage_label'] ?? $inferredFromStageLabelEn,
                $meta['from_stage_label_ar'] ?? $inferredFromStageLabelAr
            );
            $toStageLabels = $this->formatStageReportLabels(
                $history->toStage ?: $lead?->stageRelation,
                $meta['to_stage_label_en'] ?? null,
                $meta['to_stage_label_ar'] ?? null
            );
            $projectLabel = trim((string) (
                $lead?->project
                ?: ($leadMeta['lead_item_name'] ?? null)
                ?: ($leadMeta['item_name'] ?? null)
                ?: ($lead?->item_name ?? null)
                ?: ''
            ));

            return [
                'id' => (int) $history->id,
                'leadId' => (int) $history->lead_id,
                'leadName' => $lead?->name ?: ('Lead #' . $history->lead_id),
                'phone' => $lead?->phone ?: ($lead?->mobile ?: null),
                'source' => $lead?->source ?: null,
                'project' => $projectLabel !== '' ? $projectLabel : null,
                'transferredAt' => optional($history->created_at)->toIso8601String(),
                'transferredBy' => $history->performedByUser?->name ?: 'System',
                'fromSalesName' => $meta['from_assigned_to_name'] ?? null,
                'toTelesalesName' => $meta['to_assigned_to_name']
                    ?? $lead?->assignedAgent?->name
                    ?? $meta['to_manager_name']
                    ?? null,
                'toManagerName' => $meta['to_manager_name'] ?? null,
                'assignRole' => $meta['assign_role'] ?? 'sales',
                'historyOption' => $meta['history_option'] ?? null,
                'stageBefore' => $fromStageLabels['en'],
                'stageAfter' => $toStageLabels['en'],
                'stageBeforeEn' => $fromStageLabels['en'],
                'stageBeforeAr' => $fromStageLabels['ar'],
                'stageAfterEn' => $toStageLabels['en'],
                'stageAfterAr' => $toStageLabels['ar'],
            ];
        })->values();

        return response()->json($data);
    }

    /**
     * Export logs to CSV.
     */
    public function export(Request $request)
    {
        if (!$request->user()->is_super_admin) {
            abort(403, 'Unauthorized');
        }

        $query = Activity::query();

        // Apply same filters as index... (Refactoring to a scope or service would be better, but direct here is fine for now)
        if ($request->has('tenant_id'))
            $query->where('tenant_id', $request->tenant_id);
        if ($request->has('user_id'))
            $query->where('causer_id', $request->user_id)->whereIn('causer_type', $this->userMorphTypes());
        if ($request->has('log_name'))
            $query->where('log_name', $request->log_name);
        if ($request->has('subject_type'))
            $query->where('subject_type', $request->subject_type);
        if ($request->has('event'))
            $query->where('event', $request->event);
        if ($request->has('date_from'))
            $query->whereDate('created_at', '>=', $request->date_from);
        if ($request->has('date_to'))
            $query->whereDate('created_at', '<=', $request->date_to);
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('description', 'like', "%{$search}%")
                    ->orWhere('properties', 'like', "%{$search}%");
            });
        }

        $query->orderBy('created_at', 'desc');

        $response = new StreamedResponse(function () use ($query) {
            $handle = fopen('php://output', 'w');

            // CSV Header
            fputcsv($handle, [
                'ID',
                'Log Name',
                'Description',
                'Subject Type',
                'Event',
                'Causer ID',
                'Tenant ID',
                'Created At'
            ]);

            $query->chunk(1000, function ($logs) use ($handle) {
                    foreach ($logs as $log) {
                        fputcsv($handle, [
                            $log->id,
                            $log->log_name,
                            $log->description,
                            $log->subject_type,
                            $log->event,
                            $log->causer_id,
                            $log->tenant_id,
                            $log->created_at->toDateTimeString()
                        ]);
                    }
                }
                );

                fclose($handle);
            });

        $response->headers->set('Content-Type', 'text/csv');
        $response->headers->set('Content-Disposition', 'attachment; filename="activity_logs.csv"');

        return $response;
    }

    public function activeUsers(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthorized');
        }
        $tenantId = $user->tenant_id;

        $rangeFrom = $request->input('date_from');
        $rangeTo = $request->input('date_to');
        $managerId = $request->input('manager_id');

        // Presence date range (default: today). Stored as date in user_presence_daily.
        $presenceFrom = null;
        $presenceTo = null;
        try {
            $presenceFrom = $rangeFrom ? \Carbon\Carbon::parse($rangeFrom)->toDateString() : null;
        } catch (\Throwable $e) {
            $presenceFrom = null;
        }
        try {
            $presenceTo = $rangeTo ? \Carbon\Carbon::parse($rangeTo)->toDateString() : null;
        } catch (\Throwable $e) {
            $presenceTo = null;
        }
        if (!$presenceFrom && !$presenceTo) {
            $presenceFrom = now()->toDateString();
            $presenceTo = $presenceFrom;
        } elseif ($presenceFrom && !$presenceTo) {
            $presenceTo = $presenceFrom;
        } elseif (!$presenceFrom && $presenceTo) {
            $presenceFrom = $presenceTo;
        }

        $ids = [];
        $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();
        $roleLower = strtolower($user->role ?? '');
        $isSalesPerson = str_contains($roleLower, 'sales person') || str_contains($roleLower, 'salesperson') || in_array('sales person', $roles) || in_array('salesperson', $roles);
        $isTeamLeader = str_contains($roleLower, 'team leader') || in_array('team leader', $roles);

        $shouldFilter = false;

        if ($isSalesPerson) {
            $ids = [(int)$user->id];
            $shouldFilter = true;
        }
        elseif ($isTeamLeader) {
            $ids = $this->collectSubordinatesIds($user);
            $ids[] = (int)$user->id;
            $shouldFilter = true;
        }
        elseif (!empty($managerId)) {
            $root = User::where('tenant_id', $tenantId)->find($managerId);
            if ($root) {
                $ids = $this->collectSubordinatesIds($root);
                $ids[] = (int)$root->id;
                $shouldFilter = true;
            }
        }

        $query = User::where('tenant_id', $tenantId)
            ->where('status', 'active');

        // Sum online time within the requested range (or today by default).
        // Guarded to avoid runtime errors if migrations haven't run yet.
        if ($this->tenantSchema()->hasTable('user_presence_daily')) {
            $presenceAgg = $this->tenantConnection()->table('user_presence_daily')
                ->select(
                    'user_id',
                    DB::raw('SUM(total_seconds) as working_seconds'),
                    DB::raw('MAX(last_tick_at) as presence_last_tick_at')
                )
                ->where('tenant_id', $tenantId)
                ->whereBetween('date', [$presenceFrom, $presenceTo])
                ->groupBy('user_id');

            $query->leftJoinSub($presenceAgg, 'presence', function ($join) {
                $join->on('users.id', '=', 'presence.user_id');
            });

            // Ensure we still hydrate User models while keeping the join result.
            $query->select('users.*');
            $query->addSelect(DB::raw('COALESCE(presence.working_seconds, 0) as working_seconds'));
            $query->addSelect(DB::raw('presence.presence_last_tick_at as presence_last_tick_at'));
        } else {
            $query->select('users.*');
            $query->addSelect(DB::raw('0 as working_seconds'));
            $query->addSelect(DB::raw('NULL as presence_last_tick_at'));
        }

        if ($shouldFilter) {
            $query->whereIn('id', $ids);
        }

        $query->withCount(['actions as actions_count' => function ($q) use ($rangeFrom, $rangeTo) {
            if ($rangeFrom) {
                $q->where('created_at', '>=', $rangeFrom);
            }
            if ($rangeTo) {
                $q->where('created_at', '<=', $rangeTo);
            }
            $q->where(function ($activityQuery) {
                $activityQuery->where('subject_type', '!=', Lead::class)
                    ->orWhereExists(function ($leadSubQuery) {
                        $leadSubQuery->select(DB::raw(1))
                            ->from('leads')
                            ->whereColumn('leads.id', 'activity_log.subject_id')
                            ->where(function ($workflowQuery) {
                                $workflowQuery->where('leads.workflow_key', TelesalesService::WORKFLOW_SALES)
                                    ->orWhereNull('leads.workflow_key')
                                    ->orWhere('leads.workflow_key', '');
                            });
                    });
            });
        }]);

        $query->addSelect(['last_active_at' => \Laravel\Sanctum\PersonalAccessToken::select('last_used_at')
            ->whereColumn('tokenable_id', 'users.id')
            ->whereIn('tokenable_type', $this->userMorphTypes())
            ->latest('last_used_at')
            ->limit(1)
        ]);

        $users = $query->get();
        $users = $users->sortByDesc('last_active_at')->values();

        $data = $users->map(function ($u) {
            return [
            'id' => $u->id,
            'name' => $u->name,
            'role' => $u->role ?? $u->getRoleAttribute(),
            'active' => true,
            'last_active' => $u->last_active_at ?\Carbon\Carbon::parse($u->last_active_at)->toIso8601String() : null,
            'presence_last_tick_at' => $u->presence_last_tick_at ? \Carbon\Carbon::parse($u->presence_last_tick_at)->toIso8601String() : null,
            'actions_count' => $u->actions_count,
            'working_seconds' => (int) ($u->working_seconds ?? 0),
            'working_minutes' => (int) floor(((int) ($u->working_seconds ?? 0)) / 60),
            'avatar' => '',
            ];
        });

        return response()->json($data);
    }

    public function avgResponseTime(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthorized');
        }

        $tenantId = (int) $user->tenant_id;
        $managerId = $request->input('manager_id');
        $assignedTo = $request->input('assigned_to');
        $rangeFrom = $request->input('date_from');
        $rangeTo = $request->input('date_to');

        try {
            $assignedFrom = $rangeFrom
                ? \Carbon\Carbon::parse($rangeFrom)->startOfDay()
                : now()->startOfDay();
        } catch (\Throwable $e) {
            $assignedFrom = now()->startOfDay();
        }

        try {
            $assignedToDate = $rangeTo
                ? \Carbon\Carbon::parse($rangeTo)->endOfDay()
                : ($rangeFrom ? $assignedFrom->copy()->endOfDay() : now()->endOfDay());
        } catch (\Throwable $e) {
            $assignedToDate = $assignedFrom->copy()->endOfDay();
        }

        if (!$rangeFrom && $rangeTo) {
            $assignedFrom = $assignedToDate->copy()->startOfDay();
        }

        $ids = [];
        $roles = $user->getRoleNames()->map(fn($r) => strtolower($r))->toArray();
        $roleLower = strtolower($user->role ?? '');
        $isSalesPerson = str_contains($roleLower, 'sales person')
            || str_contains($roleLower, 'salesperson')
            || in_array('sales person', $roles, true)
            || in_array('salesperson', $roles, true);
        $isTeamLeader = str_contains($roleLower, 'team leader') || in_array('team leader', $roles, true);
        $shouldFilter = false;

        if (!empty($assignedTo)) {
            $ids = [(int) $assignedTo];
            $shouldFilter = true;
        } elseif ($isSalesPerson) {
            $ids = [(int) $user->id];
            $shouldFilter = true;
        } elseif ($isTeamLeader) {
            $ids = $this->collectSubordinatesIds($user);
            $ids[] = (int) $user->id;
            $shouldFilter = true;
        } elseif (!empty($managerId)) {
            $root = User::where('tenant_id', $tenantId)->find($managerId);
            if ($root) {
                $ids = $this->collectSubordinatesIds($root);
                $ids[] = (int) $root->id;
                $shouldFilter = true;
            }
        }

        $query = Lead::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('assigned_to')
            ->whereNotNull('assigned_at')
            ->whereBetween('assigned_at', [$assignedFrom, $assignedToDate]);

        $this->applyGeneralDashboardLeadWorkflowScope($query, 'workflow_key');

        if ($shouldFilter && !empty($ids)) {
            $query->whereIn('assigned_to', array_values(array_unique(array_map('intval', $ids))));
        }

        $query->select([
            'id',
            'assigned_to',
            'assigned_at',
        ]);

        $query->selectSub(function ($subQuery) use ($tenantId) {
            $subQuery->from('lead_actions')
                ->selectRaw('MIN(created_at)')
                ->whereColumn('lead_actions.lead_id', 'leads.id')
                ->whereColumn('lead_actions.user_id', 'leads.assigned_to')
                ->whereColumn('lead_actions.created_at', '>=', 'leads.assigned_at')
                ->where('lead_actions.tenant_id', $tenantId);
        }, 'first_action_at');

        $leads = $query->get();

        $respondedLeads = $leads->filter(function ($lead) {
            return !empty($lead->first_action_at) && !empty($lead->assigned_at);
        });

        $responseMinutes = $respondedLeads
            ->map(function ($lead) {
                try {
                    $assignedAt = $lead->assigned_at instanceof \Carbon\Carbon
                        ? $lead->assigned_at
                        : \Carbon\Carbon::parse($lead->assigned_at);
                    $firstActionAt = $lead->first_action_at instanceof \Carbon\Carbon
                        ? $lead->first_action_at
                        : \Carbon\Carbon::parse($lead->first_action_at);

                    return max(0, $assignedAt->diffInMinutes($firstActionAt));
                } catch (\Throwable $e) {
                    return null;
                }
            })
            ->filter(fn ($minutes) => $minutes !== null)
            ->values();

        $avgMinutes = $responseMinutes->isNotEmpty()
            ? (int) round($responseMinutes->avg())
            : null;

        return response()->json([
            'avg_minutes' => $avgMinutes,
            'responded_leads_count' => $responseMinutes->count(),
            'unresponded_leads_count' => max(0, $leads->count() - $responseMinutes->count()),
            'total_assigned_leads_count' => $leads->count(),
            'range' => [
                'from' => $assignedFrom->toDateString(),
                'to' => $assignedToDate->toDateString(),
            ],
        ]);
    }

    protected function userMorphTypes(): array
    {
        return [
            User::class,
            SharedUser::class,
        ];
    }

    protected function mapModule(Activity $activity): string
    {
        $name = $activity->log_name ?: 'general';
        if ($name === 'auth') {
            return 'User Management';
        }
        $name = str_replace(['-', '_'], ' ', $name);
        return ucwords($name);
    }

    protected function mapType(Activity $activity): string
    {
        $event = $activity->event ? strtolower($activity->event) : null;
        $description = strtolower($activity->description ?? '');

        if ($event === 'created') {
            return 'Created';
        }
        if ($event === 'updated') {
            return 'Updated';
        }
        if ($event === 'deleted') {
            return 'Deleted';
        }
        if (str_contains($description, 'failed login') || str_contains($description, 'login_failed')) {
            return 'Failed Login';
        }
        if (str_contains($description, 'logged_in') || str_contains($description, 'login')) {
            return 'Login';
        }

        return 'Activity';
    }

    protected function buildTarget(Activity $activity): string
    {
        if ($activity->subject_type && $activity->subject_id) {
            $base = class_basename($activity->subject_type);
            return $base . ' #' . $activity->subject_id;
        }

        return '-';
    }
}
