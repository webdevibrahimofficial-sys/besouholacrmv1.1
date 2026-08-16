<?php

namespace App\Http\Controllers;

use App\Models\Agency;
use App\Models\Broker;
use App\Models\Lead;
use App\Models\User;
use App\Models\Tenant;
use App\Services\TelesalesService;
use App\Support\AppliesAgencyScope;
use App\Services\TenantStorageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class UserController extends Controller
{
    use AppliesAgencyScope;

    protected function tenantIdFromRequest(?Request $request = null): ?int
    {
        $request ??= request();

        if (app()->bound('current_tenant_id')) {
            return (int) app('current_tenant_id');
        }

        if (app()->bound('tenant')) {
            return (int) app('tenant')->id;
        }

        return $request?->user()?->tenant_id ? (int) $request->user()->tenant_id : null;
    }

    protected function agencyKeyRule(?int $tenantId)
    {
        return Rule::exists('agencies', 'key')->where(function ($query) use ($tenantId) {
            if ($tenantId !== null) {
                $query->where('tenant_id', $tenantId);
            }
        });
    }

    protected function syncAgencyDisplayName(User $user): void
    {
        $meta = is_array($user->meta_data) ? $user->meta_data : [];

        if (blank($user->agency_id)) {
            unset($meta['agency_key'], $meta['agency_name']);
            $user->meta_data = !empty($meta) ? $meta : null;
            $user->save();
            return;
        }

        $agency = Agency::query()->where('key', $user->agency_id)->first();
        if (!$agency) {
            return;
        }

        $meta['agency_key'] = $agency->key;
        $meta['agency_name'] = $agency->name;
        $user->meta_data = $meta;
        $user->save();
    }

    protected function normalizeScopeValues($values): ?array
    {
        if ($values === null) {
            return null;
        }

        $filtered = collect(is_array($values) ? $values : [$values])
            ->map(fn ($value) => is_string($value) ? trim($value) : $value)
            ->filter(fn ($value) => filled($value))
            ->unique()
            ->values()
            ->all();

        return !empty($filtered) ? $filtered : null;
    }

    protected function filterExistingUserColumns(array $data): array
    {
        $allowed = [];

        foreach ($data as $key => $value) {
            if (Schema::hasColumn('users', $key)) {
                $allowed[$key] = $value;
            }
        }

        return $allowed;
    }

    protected function normalizeAssignedSalesPersonIds(array|string|int|null $raw): array
    {
        if ($raw === null) {
            return [];
        }

        $values = is_array($raw) ? $raw : [$raw];
        $ids = [];

        foreach ($values as $value) {
            if ($value === null) {
                continue;
            }

            $stringValue = trim((string) $value);
            if ($stringValue === '') {
                continue;
            }

            foreach (preg_split('/\s*,\s*/', $stringValue) ?: [] as $part) {
                $part = trim((string) $part);
                if ($part === '' || !is_numeric($part)) {
                    continue;
                }

                $intValue = (int) $part;
                if ($intValue > 0) {
                    $ids[] = $intValue;
                }
            }
        }

        $ids = array_values(array_unique($ids));
        sort($ids);

        return $ids;
    }

    protected function extractBrokerAssignedUserIds(Broker $broker): array
    {
        $meta = is_array($broker->meta_data ?? null) ? ($broker->meta_data ?? []) : [];

        return $this->normalizeAssignedSalesPersonIds(
            $meta['assigned_sales_person_ids']
                ?? $meta['sales_person_ids']
                ?? $meta['salesPersons']
                ?? null
        );
    }

    protected function dependentBrokerRows(User $user)
    {
        return Broker::query()
            ->where('tenant_id', $user->tenant_id)
            ->get(['id', 'name', 'meta_data'])
            ->map(function (Broker $broker) use ($user) {
                $assignedIds = $this->extractBrokerAssignedUserIds($broker);
                if (!in_array((int) $user->id, $assignedIds, true)) {
                    return null;
                }

                return [
                    'broker' => $broker,
                    'assigned_ids' => $assignedIds,
                    'is_sole' => count($assignedIds) <= 1,
                ];
            })
            ->filter()
            ->values();
    }

    protected function buildDeletionDependencySummary(User $user): array
    {
        $salesLeadQuery = Lead::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('assigned_to', $user->id)
            ->where(function ($query) {
                $query->where('workflow_key', TelesalesService::WORKFLOW_SALES)
                    ->orWhereNull('workflow_key')
                    ->orWhere('workflow_key', '');
            });

        $salesLeadCount = (clone $salesLeadQuery)->count();
        $salesLeadPreview = (clone $salesLeadQuery)
            ->orderBy('id')
            ->limit(5)
            ->get(['id', 'name', 'stage', 'project'])
            ->map(fn (Lead $lead) => [
                'id' => $lead->id,
                'name' => (string) ($lead->name ?? ''),
                'stage' => (string) ($lead->stage ?? ''),
                'project' => (string) ($lead->project ?? ''),
            ])
            ->values()
            ->all();

        $telesalesLeadQuery = Lead::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('assigned_to', $user->id)
            ->where('workflow_key', TelesalesService::WORKFLOW_TELESALES);

        $telesalesLeadCount = (clone $telesalesLeadQuery)->count();
        $telesalesLeadPreview = (clone $telesalesLeadQuery)
            ->orderBy('id')
            ->limit(5)
            ->get(['id', 'name', 'stage', 'project'])
            ->map(fn (Lead $lead) => [
                'id' => $lead->id,
                'name' => (string) ($lead->name ?? ''),
                'stage' => (string) ($lead->stage ?? ''),
                'project' => (string) ($lead->project ?? ''),
            ])
            ->values()
            ->all();

        $brokerRows = $this->dependentBrokerRows($user);
        $brokerCount = $brokerRows->count();
        $soleBrokerCount = $brokerRows->where('is_sole', true)->count();
        $sharedBrokerCount = $brokerCount - $soleBrokerCount;
        $brokerPreview = $brokerRows
            ->take(5)
            ->map(fn (array $row) => [
                'id' => $row['broker']->id,
                'name' => (string) ($row['broker']->name ?? ''),
                'assigned_user_ids' => $row['assigned_ids'],
                'assignment_mode' => $row['is_sole'] ? 'sole' : 'shared',
            ])
            ->values()
            ->all();

        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role,
            ],
            'dependencies' => [
                'leads' => [
                    'count' => $salesLeadCount,
                    'preview' => $salesLeadPreview,
                    'workflow' => TelesalesService::WORKFLOW_SALES,
                ],
                'telesales_leads' => [
                    'count' => $telesalesLeadCount,
                    'preview' => $telesalesLeadPreview,
                    'workflow' => TelesalesService::WORKFLOW_TELESALES,
                ],
                'brokers' => [
                    'count' => $brokerCount,
                    'sole_assigned_count' => $soleBrokerCount,
                    'shared_assigned_count' => $sharedBrokerCount,
                    'preview' => $brokerPreview,
                ],
            ],
            'can_delete' => $salesLeadCount === 0 && $telesalesLeadCount === 0 && $brokerCount === 0,
        ];
    }

    protected function salesOwnedLeadIdsForDeletion(User $user): array
    {
        return Lead::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('assigned_to', $user->id)
            ->where(function ($query) {
                $query->where('workflow_key', TelesalesService::WORKFLOW_SALES)
                    ->orWhereNull('workflow_key')
                    ->orWhere('workflow_key', '');
            })
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    protected function telesalesLeadIdsForDeletion(User $user): array
    {
        return Lead::query()
            ->where('tenant_id', $user->tenant_id)
            ->where('assigned_to', $user->id)
            ->where('workflow_key', TelesalesService::WORKFLOW_TELESALES)
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    protected function syncScopeFilters(Request $request, User $user): void
    {
        $scopeFields = ['allowed_countries', 'allowed_regions', 'allowed_sources', 'allowed_projects'];
        $hasAnyScopeField = false;

        foreach ($scopeFields as $field) {
            if (!Schema::hasColumn('users', $field)) {
                continue;
            }
            if ($request->exists($field) || $request->exists($field . '.0')) {
                $user->{$field} = $this->normalizeScopeValues($request->input($field, []));
                $hasAnyScopeField = true;
            }
        }

        if ($hasAnyScopeField) {
            $user->save();
        }
    }

    public function index(Request $request)
    {
        $authUser = $request->user();

        $query = User::with(['team.department', 'roles', 'manager']);

        $tenantIdContext = null;
        if (app()->bound('current_tenant_id')) {
            $tenantIdContext = app('current_tenant_id');
        } elseif (app()->bound('tenant')) {
            $tenantIdContext = app('tenant')->id;
        } elseif ($authUser && $authUser->tenant_id) {
            $tenantIdContext = $authUser->tenant_id;
        }

        if ($tenantIdContext !== null) {
            $query->where('tenant_id', $tenantIdContext);
        }

        if ($this->isAgencyScopedMarketingUser($authUser) && $this->currentAgencyId($authUser)) {
            $query->where('agency_id', $this->currentAgencyId($authUser));
        }

        if ($request->has('department_id')) {
            $query->whereHas('team', function ($q) use ($request) {
                $q->where('department_id', $request->department_id);
            });
        }
        
        if ($request->has('team_id')) {
            $query->where('team_id', $request->team_id);
        }

        if ($request->has('manager_id')) {
            $managerId = $request->manager_id;
            if ($managerId === 'me' && $authUser) {
                $managerId = $authUser->id;
            }
            $query->where('manager_id', $managerId);
        }

        if ($request->has('roles') || $request->has('role')) {
            $rolesParam = $request->get('roles', $request->get('role'));
            $roles = is_array($rolesParam)
                ? $rolesParam
                : collect(explode(',', (string) $rolesParam))
                    ->map(fn($r) => trim($r))
                    ->filter()
                    ->all();
            if (!empty($roles)) {
                $tenantId = app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
                $query->whereHas('roles', function ($q) use ($roles, $tenantId) {
                    $q->whereIn('name', $roles);
                    if ($tenantId !== null) {
                        $q->where('roles.' . config('permission.column_names.team_foreign_key'), $tenantId);
                    }
                });
            }
        }
        
        if ($authUser && !$authUser->is_super_admin) {
            $roleLower = strtolower($authUser->role ?? '');
            $roles = $authUser->getRoleNames()->map(fn($r) => strtolower($r))->toArray();
            $allowed = [
                'admin',
                'tenant admin',
                'tenant-admin',
                'sales admin',
                'operation manager',
                'director',
            ];
            $isPrivileged = in_array($roleLower, $allowed)
                || collect($roles)->intersect($allowed)->isNotEmpty();

            if (!$isPrivileged) {
                $tenantId = $authUser->tenant_id;
                $all = User::where('tenant_id', $tenantId)->get(['id', 'manager_id', 'tenant_id']);
                $byManager = [];
                foreach ($all as $u) {
                    $byManager[$u->manager_id ?? 0][] = $u;
                }
                $ids = [];
                $queue = [$authUser->id];
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
                $ids[] = (int) $authUser->id;
                $query->whereIn('id', $ids);
            }
        }

        $users = $query->get();

        // Calculate Inherited and Total Targets
        $this->calculateTargets($users);

        $users->each(function (User $user) {
            $user->append(['avatar_url']);
            $user->setAttribute('is_primary_admin', $this->isPrimaryAdmin($user));
        });

        return $users;
    }

    /**
     * Calculate inherited and total targets for a collection of users.
     * This assumes the collection contains all relevant users for the hierarchy.
     */
    protected function calculateTargets($users)
    {
        // Build adjacency list
        $byManager = [];
        $userMap = [];
        
        foreach ($users as $user) {
            $userMap[$user->id] = $user;
            $mid = $user->manager_id;
            if ($mid) {
                if (!isset($byManager[$mid])) {
                    $byManager[$mid] = [];
                }
                $byManager[$mid][] = $user->id;
            }
            // Initialize calculated fields
            $user->inherited_monthly_target = 0;
            $user->inherited_yearly_target = 0;
            $user->total_monthly_target = (float)($user->monthly_target ?? 0);
            $user->total_yearly_target = (float)($user->yearly_target ?? 0);
        }

        // Calculate hierarchical targets
        $calculated = [];
        foreach ($users as $user) {
            $this->calculateUserTarget($user->id, $userMap, $byManager, $calculated);
        }

        // Special Logic for Top-Level Roles (Director, Sales Admin, Operator, Tenant Admin)
        // Their Total Target = Sum of Personal Targets of ALL users in the tenant.
        
        // 1. Calculate Tenant Total Personal Targets
        $tenantTotalMonthly = 0;
        $tenantTotalYearly = 0;

        foreach ($users as $user) {
            $tenantTotalMonthly += (float)($user->monthly_target ?? 0);
            $tenantTotalYearly += (float)($user->yearly_target ?? 0);
        }

        $superManagerRoles = [
            'director',
            'sales admin',
            'operator',
            'tenant admin',
            'tenant-admin',
            'admin' // Sometimes just 'admin' is used for tenant admin
        ];

        foreach ($users as $user) {
            $userRoles = [];
            
            // Check roles relation
            if ($user->relationLoaded('roles')) {
                foreach ($user->roles as $role) {
                    $userRoles[] = strtolower(trim($role->name));
                }
            }
            
            // Check direct role attribute if exists
            if (!empty($user->role)) {
                $userRoles[] = strtolower(trim($user->role));
            }

            $isSuperManager = false;
            foreach ($superManagerRoles as $smRole) {
                if (in_array($smRole, $userRoles)) {
                    $isSuperManager = true;
                    break;
                }
            }

            if ($isSuperManager) {
                // Override Total Target
                $user->total_monthly_target = $tenantTotalMonthly;
                $user->total_yearly_target = $tenantTotalYearly;
                
                // Recalculate Inherited = Total - Personal
                // (This ensures Personal + Inherited = Total)
                $user->inherited_monthly_target = $tenantTotalMonthly - (float)($user->monthly_target ?? 0);
                $user->inherited_yearly_target = $tenantTotalYearly - (float)($user->yearly_target ?? 0);
            }
        }
    }

    protected function calculateUserTarget($userId, &$userMap, &$byManager, &$calculated)
    {
        if (isset($calculated[$userId])) {
            return $calculated[$userId];
        }

        $user = $userMap[$userId] ?? null;
        if (!$user) {
            return ['monthly' => 0, 'yearly' => 0];
        }

        $childrenIds = $byManager[$userId] ?? [];
        $inheritedMonthly = 0;
        $inheritedYearly = 0;

        foreach ($childrenIds as $childId) {
            $childTotals = $this->calculateUserTarget($childId, $userMap, $byManager, $calculated);
            $inheritedMonthly += $childTotals['monthly'];
            $inheritedYearly += $childTotals['yearly'];
        }

        $user->inherited_monthly_target = $inheritedMonthly;
        $user->inherited_yearly_target = $inheritedYearly;
        
        $user->total_monthly_target = (float)($user->monthly_target ?? 0) + $inheritedMonthly;
        $user->total_yearly_target = (float)($user->yearly_target ?? 0) + $inheritedYearly;

        $calculated[$userId] = [
            'monthly' => $user->total_monthly_target,
            'yearly' => $user->total_yearly_target
        ];

        return $calculated[$userId];
    }

    public function store(Request $request, TenantStorageService $storage)
    {
        $this->enforceAgencyAssignmentWrite($request);

        // Check User Limit
        $tenantId = null;
        if (app()->bound('current_tenant_id')) {
            $tenantId = app('current_tenant_id');
        } elseif (app()->bound('tenant')) {
            $tenantId = app('tenant')->id;
        } elseif ($request->user() && $request->user()->tenant_id) {
            $tenantId = $request->user()->tenant_id;
        }

        if ($tenantId) {
             $tenant = Tenant::find($tenantId);
             if ($tenant && $tenant->users_limit) {
                 // Count all users for this tenant to enforce limit strictly
                 $currentCount = User::withoutGlobalScopes()->where('tenant_id', $tenantId)->count();
                 if ($currentCount >= $tenant->users_limit) {
                     return response()->json([
                         'message' => 'User limit reached (' . $currentCount . '/' . $tenant->users_limit . '). Upgrade your plan to add more users.'
                     ], 403);
                 }
             }
        }

        $emailUnique = Rule::unique('users', 'email');
        $usernameUnique = Rule::unique('users', 'username');
        if ($tenantId === null) {
            $emailUnique = $emailUnique->whereNull('tenant_id');
            $usernameUnique = $usernameUnique->whereNull('tenant_id');
        } else {
            $emailUnique = $emailUnique->where('tenant_id', $tenantId);
            $usernameUnique = $usernameUnique->where('tenant_id', $tenantId);
        }

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['required', 'email', $emailUnique],
            'password' => 'required|string|min:8',
            'agency_id' => ['nullable', 'string', 'max:255', $this->agencyKeyRule($tenantId)],
            'team_id' => 'nullable|exists:teams,id',
            'username' => ['nullable', 'string', 'max:255', $usernameUnique],
            'phone' => 'nullable|string|max:20',
            'birth_date' => 'nullable|date',
            'status' => 'nullable|in:Active,Inactive,Suspended',
            'manager_id' => 'nullable|exists:users,id',
            'department_id' => 'nullable|exists:departments,id',
            'avatar' => 'nullable|image|max:5120',
            'monthly_target' => 'nullable|numeric|min:0',
            'quarterly_target' => 'nullable|numeric|min:0',
            'yearly_target' => 'nullable|numeric|min:0',
            'commission_percentage' => 'nullable|numeric|min:0|max:100',
            'allowed_countries' => 'nullable|array',
            'allowed_countries.*' => 'nullable|string|max:100',
            'allowed_regions' => 'nullable|array',
            'allowed_regions.*' => 'nullable|string|max:100',
            'allowed_sources' => 'nullable|array',
            'allowed_sources.*' => 'nullable|string|max:100',
            'allowed_projects' => 'nullable|array',
            'allowed_projects.*' => 'nullable|string|max:150',
            'notification_settings' => 'nullable|json',
        ]);
        
        if ($request->hasFile('avatar')) {
            $upload = $storage->upload($request->file('avatar'), 'avatars');
            $validated['avatar'] = $upload['path'];
        }

        if ($tenantId !== null) {
            $validated['tenant_id'] = $tenantId;
        }

        if ($this->isAgencyScopedMarketingUser($request->user())) {
            $validated['agency_id'] = $this->currentAgencyId($request->user());
        }

        $validated['password'] = Hash::make($validated['password']);
        $validated = $this->filterExistingUserColumns($validated);
        
        $user = User::create($validated);
        $this->syncAgencyDisplayName($user);

        if ($request->filled('notification_settings')) {
            $user->notification_settings = json_decode((string) $request->input('notification_settings'), true) ?: null;
            $user->save();
        }

        $this->syncScopeFilters($request, $user);
        
        if ($request->has('role')) {
            $roleName = $request->role;
            if (!empty($roleName)) {
                $tenantId = $user->tenant_id;
                $teamFk = config('permission.column_names.team_foreign_key', 'tenant_id');

                if (function_exists('setPermissionsTeamId') && $tenantId) {
                    setPermissionsTeamId($tenantId);
                }

                $roleAttributes = [
                    'name' => $roleName,
                    'guard_name' => 'web',
                ];

                if ($tenantId) {
                    $roleAttributes[$teamFk] = $tenantId;
                }

                $role = Role::firstOrCreate($roleAttributes);
                // Keep a single "current role" per user (prevents multiple roles causing UI to show the wrong one).
                $user->syncRoles([$role]);
                $user->job_title = $roleName;
                $user->save();
            }
        }

        $this->applyDuplicatePermissions($request, $user);

        $this->storeModulePermissions($request, $user);

        return response()->json($user->load(['roles', 'manager', 'team.department']), 201);
    }
    
    public function show(User $user)
    {
        $this->ensureVisibleWithinAgencyScope(request()->user(), $user);
        $user->load(['team.department', 'roles', 'manager']);
        
        // For show, we need to calculate targets too.
        // We need the whole hierarchy to do this accurately if it depends on subordinates.
        // If we only have the user, we can't calculate inherited target without querying subordinates.
        // We'll do a fresh query for subordinates (recursive).
        
        // Optimization: Fetch all users of the same tenant to build tree, then pick this user.
        // This ensures O(N) instead of N+1 recursive queries, and N is small per tenant.
        $allUsers = User::where('tenant_id', $user->tenant_id)->get();
        $this->calculateTargets($allUsers);
        
        // Find the user in the calculated collection to get the values
        $calculatedUser = $allUsers->firstWhere('id', $user->id);
        if ($calculatedUser) {
            $user->inherited_monthly_target = $calculatedUser->inherited_monthly_target;
            $user->inherited_yearly_target = $calculatedUser->inherited_yearly_target;
            $user->total_monthly_target = $calculatedUser->total_monthly_target;
            $user->total_yearly_target = $calculatedUser->total_yearly_target;
        }

        $user->setAttribute('is_primary_admin', $this->isPrimaryAdmin($user));

        return $user;
    }

    public function dependencySummary(Request $request, User $user)
    {
        $this->ensureVisibleWithinAgencyScope($request->user(), $user);

        return response()->json($this->buildDeletionDependencySummary($user));
    }

    public function update(Request $request, User $user, TenantStorageService $storage)
    {
        $this->ensureVisibleWithinAgencyScope($request->user(), $user);
        $this->enforceAgencyAssignmentWrite($request, $user);

        $emailUnique = Rule::unique('users', 'email')->ignore($user->id);
        $usernameUnique = Rule::unique('users', 'username')->ignore($user->id);
        if ($user->tenant_id === null) {
            $emailUnique = $emailUnique->whereNull('tenant_id');
            $usernameUnique = $usernameUnique->whereNull('tenant_id');
        } else {
            $emailUnique = $emailUnique->where('tenant_id', $user->tenant_id);
            $usernameUnique = $usernameUnique->where('tenant_id', $user->tenant_id);
        }

        $tenantId = $user->tenant_id ?: $this->tenantIdFromRequest($request);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => ['sometimes', 'email', $emailUnique],
            'password' => 'sometimes|string|min:8',
            'agency_id' => ['nullable', 'string', 'max:255', $this->agencyKeyRule($tenantId)],
            'team_id' => 'nullable|exists:teams,id',
            'username' => ['nullable', 'string', 'max:255', $usernameUnique],
            'phone' => 'nullable|string|max:20',
            'birth_date' => 'nullable|date',
            'status' => 'nullable|in:Active,Inactive,Suspended',
            'manager_id' => 'nullable|exists:users,id',
            'department_id' => 'nullable|exists:departments,id',
            'avatar' => 'nullable|image|max:5120',
            'monthly_target' => 'nullable|numeric|min:0',
            'quarterly_target' => 'nullable|numeric|min:0',
            'yearly_target' => 'nullable|numeric|min:0',
            'commission_percentage' => 'nullable|numeric|min:0|max:100',
            'allowed_countries' => 'nullable|array',
            'allowed_countries.*' => 'nullable|string|max:100',
            'allowed_regions' => 'nullable|array',
            'allowed_regions.*' => 'nullable|string|max:100',
            'allowed_sources' => 'nullable|array',
            'allowed_sources.*' => 'nullable|string|max:100',
            'allowed_projects' => 'nullable|array',
            'allowed_projects.*' => 'nullable|string|max:150',
            'notification_settings' => 'nullable|json',
        ]);

        if (array_key_exists('password', $validated) && $this->isPrimaryAdmin($user)) {
            unset($validated['password']);
        }
        
        $previousStatus = $user->status;
        $newStatus = $validated['status'] ?? $previousStatus;

        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        }

        if ($request->hasFile('avatar')) {
            if ($user->avatar) {
                $storage->delete($user->avatar);
            }
            $upload = $storage->upload($request->file('avatar'), 'avatars');
            $validated['avatar'] = $upload['path'];
        }
        
        if ($this->isAgencyScopedMarketingUser($request->user())) {
            $validated['agency_id'] = $this->currentAgencyId($request->user());
        }

        $validated = $this->filterExistingUserColumns($validated);
        
        $user->update($validated);
        $this->syncAgencyDisplayName($user);

        if ($request->exists('notification_settings')) {
            $user->notification_settings = $request->filled('notification_settings')
                ? (json_decode((string) $request->input('notification_settings'), true) ?: null)
                : null;
            $user->save();
        }

        $this->syncScopeFilters($request, $user);

        if ($previousStatus === 'Active' && $newStatus === 'Inactive') {
            $user->tokens()->delete();
        }
        
        if ($request->has('role')) {
            $roleName = $request->role;

            if (!empty($roleName)) {
                $tenantId = $user->tenant_id;
                $teamFk = config('permission.column_names.team_foreign_key', 'tenant_id');

                if (function_exists('setPermissionsTeamId') && $tenantId) {
                    setPermissionsTeamId($tenantId);
                }

                $roleAttributes = [
                    'name' => $roleName,
                    'guard_name' => 'web',
                ];

                if ($tenantId) {
                    $roleAttributes[$teamFk] = $tenantId;
                }

                $role = Role::firstOrCreate($roleAttributes);
                $user->syncRoles([$role]);
                $user->job_title = $roleName;
                $user->save();
            } else {
                $user->syncRoles([]);
                $user->job_title = null;
                $user->save();
            }
        }

        $this->applyDuplicatePermissions($request, $user);

        $this->storeModulePermissions($request, $user);

        // Recalculate targets for the updated user
        $allUsers = User::where('tenant_id', $user->tenant_id)->get();
        // We need to update the user in the collection with the new values we just saved
        // but $allUsers already has the fresh data from DB because we just saved $user
        $this->calculateTargets($allUsers);
        
        $calculatedUser = $allUsers->firstWhere('id', $user->id);
        if ($calculatedUser) {
            $user->inherited_monthly_target = $calculatedUser->inherited_monthly_target;
            $user->inherited_yearly_target = $calculatedUser->inherited_yearly_target;
            $user->total_monthly_target = $calculatedUser->total_monthly_target;
            $user->total_yearly_target = $calculatedUser->total_yearly_target;
        }

        return response()->json($user->load(['roles', 'manager', 'team.department']));
    }
    
    public function reassignDependencies(Request $request, User $user)
    {
        $actor = $request->user();
        $this->ensureVisibleWithinAgencyScope($actor, $user);

        $summary = $this->buildDeletionDependencySummary($user);
        $salesLeadCount = (int) ($summary['dependencies']['leads']['count'] ?? 0);
        $telesalesLeadCount = (int) ($summary['dependencies']['telesales_leads']['count'] ?? 0);
        $soleBrokerCount = (int) ($summary['dependencies']['brokers']['sole_assigned_count'] ?? 0);

        $validated = $request->validate([
            'telesales_target_user_id' => [
                'nullable',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query->where('tenant_id', $user->tenant_id)),
            ],
            'telesales_assign_role' => 'nullable|in:sales,manager',
            'telesales_method' => 'nullable|in:fresh,cold_call',
            'telesales_options' => 'nullable|array',
            'telesales_options.sameStage' => 'nullable|boolean',
            'telesales_options.clearHistory' => 'nullable|boolean',
            'lead_target_user_id' => [
                'nullable',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query->where('tenant_id', $user->tenant_id)),
            ],
            'assign_role' => 'nullable|in:sales,manager',
            'lead_stage' => 'nullable|in:new_lead,cold_calls,same_stage',
            'lead_history_option' => 'nullable|in:keep_history,assign_as_new',
            'broker_target_user_id' => [
                'nullable',
                'integer',
                Rule::exists('users', 'id')->where(fn ($query) => $query->where('tenant_id', $user->tenant_id)),
            ],
        ]);

        if ($telesalesLeadCount > 0 && empty($validated['telesales_target_user_id'])) {
            throw ValidationException::withMessages([
                'telesales_target_user_id' => ['Telesales reassignment target is required before deleting this user.'],
            ]);
        }

        if ($salesLeadCount > 0 && empty($validated['lead_target_user_id'])) {
            throw ValidationException::withMessages([
                'lead_target_user_id' => ['Lead reassignment target is required before deleting this user.'],
            ]);
        }

        if ($soleBrokerCount > 0 && empty($validated['broker_target_user_id'])) {
            throw ValidationException::withMessages([
                'broker_target_user_id' => ['Broker reassignment target is required for brokers assigned only to this user.'],
            ]);
        }

        if (!empty($validated['telesales_target_user_id']) && (int) $validated['telesales_target_user_id'] === (int) $user->id) {
            throw ValidationException::withMessages([
                'telesales_target_user_id' => ['Telesales reassignment target must be a different user.'],
            ]);
        }

        if (!empty($validated['lead_target_user_id']) && (int) $validated['lead_target_user_id'] === (int) $user->id) {
            throw ValidationException::withMessages([
                'lead_target_user_id' => ['Lead reassignment target must be a different user.'],
            ]);
        }

        if (!empty($validated['broker_target_user_id']) && (int) $validated['broker_target_user_id'] === (int) $user->id) {
            throw ValidationException::withMessages([
                'broker_target_user_id' => ['Broker reassignment target must be a different user.'],
            ]);
        }

        $brokerTargetUser = !empty($validated['broker_target_user_id'])
            ? User::find((int) $validated['broker_target_user_id'])
            : null;

        DB::transaction(function () use ($user, $actor, $validated, $brokerTargetUser, $salesLeadCount, $telesalesLeadCount) {
            if ($telesalesLeadCount > 0) {
                $telesalesLeadIds = $this->telesalesLeadIdsForDeletion($user);
                $telesalesController = app(TelesalesController::class);
                $assignRequest = Request::create(
                    '/api/telesales/assign-leads',
                    'POST',
                    [
                        'lead_ids' => $telesalesLeadIds,
                        'assigned_to' => (int) $validated['telesales_target_user_id'],
                        'assign_role' => $validated['telesales_assign_role'] ?? 'sales',
                        'method' => $validated['telesales_method'] ?? 'fresh',
                        'options' => $validated['telesales_options'] ?? [],
                    ]
                );
                $assignRequest->setUserResolver(fn () => $actor);

                $response = $telesalesController->bulkAssign($assignRequest);
                if (method_exists($response, 'getStatusCode') && $response->getStatusCode() >= 400) {
                    $payload = json_decode((string) $response->getContent(), true);
                    $message = $payload['message'] ?? 'Failed to reassign one or more telesales leads.';
                    throw ValidationException::withMessages([
                        'telesales_target_user_id' => [$message],
                    ]);
                }
            }

            if ($salesLeadCount > 0) {
                $leadIds = $this->salesOwnedLeadIdsForDeletion($user);
                $leadController = app(LeadController::class);
                $assignRequest = Request::create(
                    '/api/leads/bulk-assign',
                    'POST',
                    [
                        'ids' => $leadIds,
                        'assigned_to' => (int) $validated['lead_target_user_id'],
                        'assign_role' => $validated['assign_role'] ?? 'sales',
                        'stage' => $validated['lead_stage'] ?? 'same_stage',
                        'history_option' => $validated['lead_history_option'] ?? 'keep_history',
                    ]
                );
                $assignRequest->setUserResolver(fn () => $actor);

                $response = $leadController->bulkAssign($assignRequest);
                if (method_exists($response, 'getStatusCode') && $response->getStatusCode() >= 400) {
                    $payload = json_decode((string) $response->getContent(), true);
                    $message = $payload['message'] ?? 'Failed to reassign one or more leads.';
                    throw ValidationException::withMessages([
                        'lead_target_user_id' => [$message],
                    ]);
                }
                if (($validated['assign_role'] ?? 'sales') === 'manager') {
                    Lead::query()
                        ->whereIn('id', $leadIds)
                        ->update(['status' => 'pending']);
                }
            }

            foreach ($this->dependentBrokerRows($user) as $row) {
                /** @var Broker $broker */
                $broker = $row['broker'];
                $assignedIds = array_values(array_filter(
                    $row['assigned_ids'],
                    fn (int $assignedId) => $assignedId !== (int) $user->id
                ));

                if ($row['is_sole'] && $brokerTargetUser) {
                    $assignedIds[] = (int) $brokerTargetUser->id;
                }

                $assignedIds = array_values(array_unique(array_filter($assignedIds, fn ($id) => (int) $id > 0)));
                sort($assignedIds);

                $meta = is_array($broker->meta_data ?? null) ? ($broker->meta_data ?? []) : [];
                $meta['assigned_sales_person_ids'] = $assignedIds;
                $meta['sales_person_ids'] = $assignedIds;
                $broker->meta_data = $meta;
                $broker->save();
            }
        });

        $freshSummary = $this->buildDeletionDependencySummary($user);

        return response()->json([
            'message' => 'User dependencies reassigned successfully.',
            'summary' => $freshSummary,
        ]);
    }

    public function destroy(Request $request, User $user)
    {
        $this->ensureVisibleWithinAgencyScope($request->user(), $user);
        if ($this->isPrimaryAdmin($user)) {
            return response()->json([
                'message' => 'Primary admin user cannot be deleted.',
            ], 403);
        }

        $summary = $this->buildDeletionDependencySummary($user);
        if (!$summary['can_delete']) {
            return response()->json([
                'message' => 'This user still has assigned leads or brokers. Reassign them before deleting the user.',
                'code' => 'user_dependencies_exist',
                'summary' => $summary,
            ], 409);
        }

        $user->delete();
        return response()->noContent();
    }

    public function avatar(User $user)
    {
        if (!$user->avatar) {
            abort(404);
        }
        
        // Security Check: Same Tenant Only (unless Super Admin)
        $authUser = \Illuminate\Support\Facades\Auth::user();
        if (! $authUser) {
            abort(401);
        }
        if ($authUser->tenant_id !== $user->tenant_id && !$authUser->is_super_admin) {
             abort(403);
        }

        $disk = \Illuminate\Support\Facades\Storage::disk('tenants');
        $contents = $disk->get($user->avatar);

        return response($contents, 200, ['Content-Type' => 'application/octet-stream']);
    }

    protected function storeModulePermissions(Request $request, User $user): void
    {
        $meta = is_array($user->meta_data) ? $user->meta_data : [];
        $current = $meta['module_permissions'] ?? [];
        $current = is_array($current) ? $current : [];

        $permissions = $request->input('permissions');

        // Auto-grant: every user always gets Leads.addAction (hidden in UI).
        $roleName = (string) ($request->input('role') ?? $user->job_title ?? $user->role ?? '');
        $roleNorm = strtolower(trim(preg_replace('/\s+/', ' ', str_replace(['_', '-'], ' ', $roleName))));
        $isAccountant = $roleNorm === 'accountant';

        if (!is_array($permissions)) {
            $permissions = $current;
        }

        $leadPerms = $permissions['Leads'] ?? [];
        $leadPerms = is_array($leadPerms) ? $leadPerms : [];
        if (!in_array('addAction', $leadPerms, true)) {
            $leadPerms[] = 'addAction';
        }
        $permissions['Leads'] = array_values(array_unique($leadPerms));

        // Auto-grant: Accountant users get Contract & Collections core permissions by default.
        if ($isAccountant) {
            $ccPerms = $permissions['ContractCollections'] ?? [];
            $ccPerms = is_array($ccPerms) ? $ccPerms : [];
            foreach (['showModule', 'viewContracts', 'viewInstallments', 'payInstallment', 'printReceipt'] as $p) {
                if (!in_array($p, $ccPerms, true)) $ccPerms[] = $p;
            }
            $permissions['ContractCollections'] = array_values(array_unique($ccPerms));
        }

        // Delete Customer is admin-managed: only Director / Operation Manager may keep the toggle.
        $canHoldDeleteCustomer = in_array($roleNorm, ['director', 'operation manager', 'operations manager'], true);
        $customerPerms = $permissions['Customers'] ?? [];
        $customerPerms = is_array($customerPerms) ? $customerPerms : [];
        if (! $canHoldDeleteCustomer) {
            $customerPerms = array_values(array_filter($customerPerms, fn ($perm) => $perm !== 'deleteCustomer'));
            if ($customerPerms !== []) {
                $permissions['Customers'] = $customerPerms;
            } else {
                unset($permissions['Customers']);
            }
        }

        $meta['module_permissions'] = $permissions;
        $user->meta_data = $meta;
        $user->save();
    }

    protected function applyDuplicatePermissions(Request $request, User $user): void
    {
        $permissions = $request->input('permissions', []);
        $leadPerms = is_array($permissions) ? ($permissions['Leads'] ?? []) : [];
        $leadPerms = is_array($leadPerms) ? $leadPerms : [];

        // Ensure permissions exist
        $view = Permission::firstOrCreate(['name' => 'view-duplicate-leads', 'guard_name' => 'web']);
        $act  = Permission::firstOrCreate(['name' => 'act-on-duplicate-leads', 'guard_name' => 'web']);

        // Spatie teams context
        $tenantId = app()->bound('current_tenant_id') ? app('current_tenant_id') : null;
        if (function_exists('setPermissionsTeamId') && $tenantId) {
            setPermissionsTeamId($tenantId);
        }

        // Assign or revoke based on selected items
        if (in_array('viewDuplicateLeads', $leadPerms, true)) {
            $user->givePermissionTo($view);
        } else {
            if ($user->hasPermissionTo($view->name)) {
                $user->revokePermissionTo($view);
            }
        }
        if (in_array('actOnDuplicateLeads', $leadPerms, true)) {
            $user->givePermissionTo($act);
        } else {
            if ($user->hasPermissionTo($act->name)) {
                $user->revokePermissionTo($act);
            }
        }
    }

    protected function isPrimaryAdmin(User $user): bool
    {
        if ($user->is_super_admin) {
            return true;
        }

        $tenant = $user->tenant;
        if (!$tenant) {
            return false;
        }

        $owner = $tenant->owner;
        return $owner && $owner->id === $user->id;
    }

    protected function ensureVisibleWithinAgencyScope(?User $actor, User $target): void
    {
        if (!$this->isAgencyScopedMarketingUser($actor)) {
            return;
        }

        if ((string) ($target->agency_id ?? '') !== (string) $this->currentAgencyId($actor)) {
            abort(404);
        }
    }

    protected function enforceAgencyAssignmentWrite(Request $request, ?User $target = null): void
    {
        $actor = $request->user();
        if (!$this->isAgencyScopedMarketingUser($actor)) {
            return;
        }

        $expectedAgencyId = (string) $this->currentAgencyId($actor);
        $requestedAgencyId = trim((string) $request->input('agency_id', ''));

        if ($requestedAgencyId !== '' && $requestedAgencyId !== $expectedAgencyId) {
            abort(403, 'You cannot assign a different agency.');
        }

        if ($target && trim((string) ($target->agency_id ?? '')) !== $expectedAgencyId) {
            abort(404);
        }
    }
}
