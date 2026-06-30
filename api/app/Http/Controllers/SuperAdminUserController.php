<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class SuperAdminUserController extends Controller
{
    protected const DEFAULT_SYSTEM_ROLES = [
        'Platform Owner',
        'system admin',
        'Platform Admin',
        'Operations Admin',
        'Support Admin',
        'Audit Manager',
    ];

    protected const DEFAULT_SYSTEM_PERMISSIONS = [
        'system.dashboard.view',
        'system.dashboard.kpis',
        'system.dashboard.health',
        'system.dashboard.growth',
        'system.dashboard.plan_distribution',
        'system.dashboard.status_breakdown',
        'system.dashboard.recent_tenants',
        'system.dashboard.expiring_soon',
        'system.admin_users.view',
        'system.admin_users.create',
        'system.admin_users.update',
        'system.admin_users.delete',
        'system.roles.view',
        'system.roles.create',
        'system.roles.update',
        'system.roles.delete',
        'system.tasks.view',
        'system.tasks.manage',
        'system.audit_logs.view',
        'system.audit_logs.export',
        'system.tenants.view',
        'system.tenants.manage',
        'system.subscriptions.view',
        'system.subscriptions.manage',
        'system.settings.view',
        'system.settings.manage',
        'system.integrations.view',
        'system.integrations.manage',
        'system.website.view',
        'system.website.manage',
        'system.backup.view',
        'system.backup.manage',
        'system.errors.view',
    ];

    protected const DEFAULT_ROLE_PERMISSIONS = [
        'Platform Owner' => self::DEFAULT_SYSTEM_PERMISSIONS,
        'system admin' => self::DEFAULT_SYSTEM_PERMISSIONS,
        'Platform Admin' => [
            'system.dashboard.view',
            'system.dashboard.kpis',
            'system.dashboard.health',
            'system.dashboard.growth',
            'system.dashboard.plan_distribution',
            'system.dashboard.status_breakdown',
            'system.dashboard.recent_tenants',
            'system.dashboard.expiring_soon',
            'system.admin_users.view',
            'system.admin_users.create',
            'system.admin_users.update',
            'system.roles.view',
            'system.roles.create',
            'system.roles.update',
            'system.tasks.view',
            'system.tasks.manage',
            'system.audit_logs.view',
            'system.audit_logs.export',
            'system.tenants.view',
            'system.tenants.manage',
            'system.subscriptions.view',
            'system.subscriptions.manage',
            'system.settings.view',
            'system.settings.manage',
            'system.integrations.view',
            'system.integrations.manage',
            'system.website.view',
            'system.website.manage',
            'system.backup.view',
            'system.backup.manage',
            'system.errors.view',
        ],
        'Audit Manager' => [
            'system.dashboard.view',
            'system.dashboard.kpis',
            'system.dashboard.health',
            'system.dashboard.growth',
            'system.dashboard.plan_distribution',
            'system.dashboard.status_breakdown',
            'system.dashboard.recent_tenants',
            'system.dashboard.expiring_soon',
            'system.admin_users.view',
            'system.roles.view',
            'system.tasks.view',
            'system.audit_logs.view',
            'system.audit_logs.export',
            'system.tenants.view',
            'system.subscriptions.view',
            'system.settings.view',
            'system.integrations.view',
            'system.website.view',
            'system.backup.view',
            'system.errors.view',
        ],
        'Operations Admin' => [
            'system.dashboard.view',
            'system.dashboard.kpis',
            'system.dashboard.health',
            'system.dashboard.growth',
            'system.dashboard.plan_distribution',
            'system.dashboard.status_breakdown',
            'system.dashboard.recent_tenants',
            'system.dashboard.expiring_soon',
            'system.tasks.view',
            'system.tasks.manage',
            'system.audit_logs.view',
            'system.tenants.view',
            'system.tenants.manage',
            'system.subscriptions.view',
            'system.subscriptions.manage',
            'system.settings.view',
            'system.integrations.view',
            'system.integrations.manage',
            'system.website.view',
            'system.website.manage',
            'system.backup.view',
            'system.errors.view',
        ],
        'Support Admin' => [
            'system.dashboard.view',
            'system.dashboard.kpis',
            'system.dashboard.health',
            'system.dashboard.growth',
            'system.dashboard.plan_distribution',
            'system.dashboard.status_breakdown',
            'system.dashboard.recent_tenants',
            'system.dashboard.expiring_soon',
            'system.tasks.view',
            'system.tasks.manage',
            'system.audit_logs.view',
            'system.tenants.view',
            'system.subscriptions.view',
            'system.errors.view',
        ],
    ];

    public function index(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $systemTenant = $this->ensureSystemTenant();
        if (function_exists('setPermissionsTeamId')) {
            setPermissionsTeamId($systemTenant->id);
        }
        $this->ensureDefaultPermissions();
        $this->ensureDefaultRoles($systemTenant->id);

        $perPage = max(10, min((int) $request->integer('per_page', 10), 100));
        $search = trim((string) $request->input('search', ''));
        $status = trim((string) $request->input('status', ''));
        $role = trim((string) $request->input('role', ''));

        $query = User::withoutGlobalScope('tenant')
            ->where('is_super_admin', true)
            ->where('tenant_id', $systemTenant->id)
            ->with([
                'roles' => function ($roleQuery) use ($systemTenant) {
                    $roleQuery
                        ->where('roles.guard_name', 'web')
                        ->where('roles.tenant_id', $systemTenant->id)
                        ->orderBy('name');
                },
                'permissions' => function ($permissionQuery) {
                    $permissionQuery
                        ->where('guard_name', 'web')
                        ->where('name', 'like', 'system.%')
                        ->orderBy('name');
                },
            ])
            ->orderByRaw("CASE WHEN status = 'Active' OR status IS NULL THEN 0 ELSE 1 END")
            ->orderBy('name');

        if ($search !== '') {
            $query->where(function ($searchQuery) use ($search) {
                $searchQuery
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%");
            });
        }

        if ($status !== '' && $status !== 'all') {
            if ($status === 'Active') {
                $query->where(function ($statusQuery) {
                    $statusQuery->where('status', 'Active')->orWhereNull('status');
                });
            } else {
                $query->where('status', $status);
            }
        }

        if ($role !== '' && $role !== 'all') {
            $query->whereHas('roles', function ($roleQuery) use ($role, $systemTenant) {
                $roleQuery
                    ->where('roles.name', $role)
                    ->where('roles.guard_name', 'web')
                    ->where('roles.tenant_id', $systemTenant->id);
            });
        }

        $users = $query->paginate($perPage);

        $users->getCollection()->transform(function (User $user) use ($systemTenant) {
            $primaryRole = $user->roles->first();

            return [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'status' => $user->status ?: 'Active',
                'is_super_admin' => (bool) $user->is_super_admin,
                'role' => $primaryRole?->name,
                'roles' => $user->roles->pluck('name')->values(),
                'permissions' => $this->resolveSystemPermissionSelection($user, $systemTenant->id),
                'created_at' => optional($user->created_at)->toISOString(),
                'updated_at' => optional($user->updated_at)->toISOString(),
            ];
        });

        return response()->json([
            'users' => $users,
            'summary' => [
                'total' => User::withoutGlobalScope('tenant')
                    ->where('is_super_admin', true)
                    ->where('tenant_id', $systemTenant->id)
                    ->count(),
                'active' => User::withoutGlobalScope('tenant')
                    ->where('is_super_admin', true)
                    ->where('tenant_id', $systemTenant->id)
                    ->where(function ($statusQuery) {
                        $statusQuery->where('status', 'Active')->orWhereNull('status');
                    })
                    ->count(),
                'inactive' => User::withoutGlobalScope('tenant')
                    ->where('is_super_admin', true)
                    ->where('tenant_id', $systemTenant->id)
                    ->whereNotNull('status')
                    ->where('status', '!=', 'Active')
                    ->count(),
                'roles' => Role::query()
                    ->where('tenant_id', $systemTenant->id)
                    ->where('guard_name', 'web')
                    ->count(),
                'permissions' => Permission::query()
                    ->where('guard_name', 'web')
                    ->where('name', 'like', 'system.%')
                    ->count(),
            ],
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $systemTenant = $this->ensureSystemTenant();
        $this->ensureDefaultPermissions();
        $this->ensureDefaultRoles($systemTenant->id);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => [
                'required',
                'email',
                Rule::unique('users', 'email')->where(function ($query) use ($systemTenant) {
                    return $query->where('tenant_id', $systemTenant->id);
                }),
            ],
            'phone' => 'nullable|string|max:20',
            'password' => 'required|string|min:8',
            'status' => 'nullable|in:Active,Inactive,Suspended',
            'role' => [
                'required',
                'string',
                Rule::exists('roles', 'name')->where(function ($query) use ($systemTenant) {
                    return $query->where('tenant_id', $systemTenant->id)->where('guard_name', 'web');
                }),
            ],
            'permissions' => 'nullable|array',
            'permissions.*' => [
                'string',
                Rule::exists('permissions', 'name')->where(function ($query) {
                    return $query->where('guard_name', 'web');
                }),
            ],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'phone' => $validated['phone'] ?? null,
            'password' => Hash::make($validated['password']),
            'tenant_id' => $systemTenant->id,
            'is_super_admin' => true,
            'status' => $validated['status'] ?? 'Active',
            'job_title' => $validated['role'],
        ]);

        $this->syncSystemRole($user, $validated['role'], $systemTenant->id);
        $this->syncSystemPermissionSelection($user, $validated['role'], $validated['permissions'] ?? [], $systemTenant->id);

        $user->load(['roles', 'permissions']);

        return response()->json([
            'message' => 'Super admin user created successfully.',
            'user' => $this->serializeUser($user, $systemTenant->id),
        ], 201);
    }

    public function update(Request $request, int $user)
    {
        $this->authorizeSuperAdmin($request);

        $systemTenant = $this->ensureSystemTenant();
        $user = User::withoutGlobalScope('tenant')->findOrFail($user);
        $this->ensureSystemUser($user, $systemTenant->id);
        $this->ensureDefaultPermissions();
        $this->ensureDefaultRoles($systemTenant->id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:255',
            'email' => [
                'sometimes',
                'email',
                Rule::unique('users', 'email')
                    ->ignore($user->id)
                    ->where(function ($query) use ($systemTenant) {
                        return $query->where('tenant_id', $systemTenant->id);
                    }),
            ],
            'phone' => 'nullable|string|max:20',
            'password' => 'nullable|string|min:8',
            'status' => 'nullable|in:Active,Inactive,Suspended',
            'role' => [
                'nullable',
                'string',
                Rule::exists('roles', 'name')->where(function ($query) use ($systemTenant) {
                    return $query->where('tenant_id', $systemTenant->id)->where('guard_name', 'web');
                }),
            ],
            'permissions' => 'nullable|array',
            'permissions.*' => [
                'string',
                Rule::exists('permissions', 'name')->where(function ($query) {
                    return $query->where('guard_name', 'web');
                }),
            ],
        ]);

        if ((int) $request->user()->id === (int) $user->id && ($validated['status'] ?? $user->status) !== 'Active') {
            return response()->json([
                'message' => 'You cannot deactivate your own super admin account.',
            ], 422);
        }

        $currentStatus = $user->status ?: 'Active';
        $nextStatus = $validated['status'] ?? $currentStatus;

        if ($nextStatus !== 'Active' && $currentStatus === 'Active' && $this->activeUsersCount($systemTenant->id) <= 1) {
            return response()->json([
                'message' => 'At least one active super admin user must remain.',
            ], 422);
        }

        if (array_key_exists('name', $validated)) {
            $user->name = $validated['name'];
        }

        if (array_key_exists('email', $validated)) {
            $user->email = $validated['email'];
        }

        $user->phone = $validated['phone'] ?? null;

        if (!empty($validated['password'])) {
            $user->password = Hash::make($validated['password']);
        }

        if (array_key_exists('status', $validated)) {
            $user->status = $validated['status'];
        }

        if (!empty($validated['role'])) {
            $user->job_title = $validated['role'];
        }

        $user->save();

        if (!empty($validated['role'])) {
            $this->syncSystemRole($user, $validated['role'], $systemTenant->id);
        }

        if (array_key_exists('permissions', $validated)) {
            $effectiveRole = $validated['role'] ?? $user->roles->where('tenant_id', $systemTenant->id)->pluck('name')->first() ?? $user->job_title ?? '';
            $this->syncSystemPermissionSelection($user, (string) $effectiveRole, $validated['permissions'] ?? [], $systemTenant->id);
        }

        $user->load(['roles', 'permissions']);

        return response()->json([
            'message' => 'Super admin user updated successfully.',
            'user' => $this->serializeUser($user, $systemTenant->id),
        ]);
    }

    public function destroy(Request $request, int $user)
    {
        $this->authorizeSuperAdmin($request);

        $systemTenant = $this->ensureSystemTenant();
        $user = User::withoutGlobalScope('tenant')->findOrFail($user);
        $this->ensureSystemUser($user, $systemTenant->id);

        if ((int) $request->user()->id === (int) $user->id) {
            return response()->json([
                'message' => 'You cannot delete your own super admin account.',
            ], 422);
        }

        if ($this->activeUsersCount($systemTenant->id) <= 1 && ($user->status ?: 'Active') === 'Active') {
            return response()->json([
                'message' => 'At least one active super admin user must remain.',
            ], 422);
        }

        if (function_exists('setPermissionsTeamId')) {
            setPermissionsTeamId($systemTenant->id);
        }

        $user->syncRoles([]);
        $user->delete();

        return response()->json([
            'message' => 'Super admin user deleted successfully.',
        ]);
    }

    public function rolesIndex(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $systemTenant = $this->ensureSystemTenant();
        if (function_exists('setPermissionsTeamId')) {
            setPermissionsTeamId($systemTenant->id);
        }
        $this->ensureDefaultPermissions();
        $this->ensureDefaultRoles($systemTenant->id);
        $users = User::withoutGlobalScope('tenant')
            ->where('is_super_admin', true)
            ->where('tenant_id', $systemTenant->id)
            ->with([
                'roles' => function ($query) use ($systemTenant) {
                    $query
                        ->where('roles.tenant_id', $systemTenant->id)
                        ->where('roles.guard_name', 'web');
                },
            ])
            ->get();

        $usageCounts = [];
        foreach ($users as $user) {
            foreach ($user->roles as $role) {
                $usageCounts[$role->id] = ($usageCounts[$role->id] ?? 0) + 1;
            }
        }

        $roles = Role::query()
            ->with([
                'permissions' => function ($query) {
                    $query
                        ->where('guard_name', 'web')
                        ->where('name', 'like', 'system.%')
                        ->orderBy('name');
                },
            ])
            ->where('tenant_id', $systemTenant->id)
            ->where('guard_name', 'web')
            ->get()
            ->map(function (Role $role) use ($usageCounts) {
                return [
                    'id' => $role->id,
                    'name' => $role->name,
                    'permissions' => $role->permissions->pluck('name')->values(),
                    'permissions_count' => $role->permissions->count(),
                    'users_count' => $usageCounts[$role->id] ?? 0,
                    'created_at' => optional($role->created_at)->toISOString(),
                    'updated_at' => optional($role->updated_at)->toISOString(),
                ];
            })
            ->sort(function (array $left, array $right) {
                $priorityCompare = $this->rolePriority($left['name']) <=> $this->rolePriority($right['name']);
                if ($priorityCompare !== 0) {
                    return $priorityCompare;
                }

                $permissionCompare = ($right['permissions_count'] ?? 0) <=> ($left['permissions_count'] ?? 0);
                if ($permissionCompare !== 0) {
                    return $permissionCompare;
                }

                return strcasecmp($left['name'], $right['name']);
            })
            ->values();

        return response()->json([
            'roles' => $roles,
        ]);
    }

    public function permissionsIndex(Request $request)
    {
        $this->authorizeSuperAdmin($request);
        $this->ensureDefaultPermissions();

        $permissions = Permission::query()
            ->where('guard_name', 'web')
            ->where('name', 'like', 'system.%')
            ->orderBy('name')
            ->get()
            ->map(function (Permission $permission) {
                return [
                    'id' => $permission->id,
                    'name' => $permission->name,
                    'group' => $this->permissionGroup($permission->name),
                    'label' => $this->permissionLabel($permission->name),
                ];
            })
            ->values();

        return response()->json([
            'permissions' => $permissions,
        ]);
    }

    public function storeRole(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $systemTenant = $this->ensureSystemTenant();

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('roles', 'name')->where(function ($query) use ($systemTenant) {
                    return $query->where('tenant_id', $systemTenant->id)->where('guard_name', 'web');
                }),
            ],
        ]);

        $role = Role::create([
            'name' => trim($validated['name']),
            'guard_name' => 'web',
            'tenant_id' => $systemTenant->id,
        ]);

        return response()->json([
            'message' => 'System role created successfully.',
            'role' => [
                'id' => $role->id,
                'name' => $role->name,
                'permissions' => $role->permissions->pluck('name')->values(),
                'permissions_count' => $role->permissions->count(),
                'users_count' => 0,
                'created_at' => optional($role->created_at)->toISOString(),
                'updated_at' => optional($role->updated_at)->toISOString(),
            ],
        ], 201);
    }

    public function updateRole(Request $request, Role $role)
    {
        $this->authorizeSuperAdmin($request);

        $systemTenant = $this->ensureSystemTenant();
        $this->ensureSystemRole($role, $systemTenant->id);

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('roles', 'name')
                    ->ignore($role->id)
                    ->where(function ($query) use ($systemTenant) {
                        return $query->where('tenant_id', $systemTenant->id)->where('guard_name', 'web');
                    }),
            ],
        ]);

        $previousName = $role->name;
        $role->update([
            'name' => trim($validated['name']),
        ]);

        $users = User::withoutGlobalScope('tenant')
            ->where('is_super_admin', true)
            ->where('tenant_id', $systemTenant->id)
            ->where('job_title', $previousName)
            ->get();

        foreach ($users as $user) {
            $user->job_title = $role->name;
            $user->save();
            $this->syncSystemRole($user, $role->name, $systemTenant->id);
        }

        return response()->json([
            'message' => 'System role updated successfully.',
            'role' => [
                'id' => $role->id,
                'name' => $role->name,
                'permissions' => $role->permissions->pluck('name')->values(),
                'permissions_count' => $role->permissions->count(),
                'users_count' => count($users),
                'created_at' => optional($role->created_at)->toISOString(),
                'updated_at' => optional($role->updated_at)->toISOString(),
            ],
        ]);
    }

    public function destroyRole(Request $request, Role $role)
    {
        $this->authorizeSuperAdmin($request);

        $systemTenant = $this->ensureSystemTenant();
        $this->ensureSystemRole($role, $systemTenant->id);

        $assignedUsersCount = User::withoutGlobalScope('tenant')
            ->where('is_super_admin', true)
            ->where('tenant_id', $systemTenant->id)
            ->whereHas('roles', function ($query) use ($role, $systemTenant) {
                $query
                    ->where('roles.id', $role->id)
                    ->where('roles.tenant_id', $systemTenant->id);
            })
            ->count();

        if ($assignedUsersCount > 0) {
            return response()->json([
                'message' => 'This role is still assigned to super admin users.',
            ], 422);
        }

        $role->delete();

        return response()->json([
            'message' => 'System role deleted successfully.',
        ]);
    }

    protected function authorizeSuperAdmin(Request $request): void
    {
        if (!$request->user() || !$request->user()->is_super_admin) {
            abort(403, 'Super Admin access required.');
        }
    }

    protected function ensureSystemTenant(): Tenant
    {
        return Tenant::firstOrCreate(
            ['slug' => 'owner'],
            [
                'name' => 'Owner Tenant',
                'domain' => 'owner.localhost',
                'status' => 'active',
                'subscription_plan' => 'professional',
            ]
        );
    }

    protected function ensureDefaultRoles(int $tenantId): void
    {
        foreach (self::DEFAULT_SYSTEM_ROLES as $roleName) {
            $role = Role::firstOrCreate([
                'tenant_id' => $tenantId,
                'name' => $roleName,
                'guard_name' => 'web',
            ]);

            $this->syncDefaultRolePermissions($role, $tenantId);
        }
    }

    protected function ensureDefaultPermissions(): void
    {
        foreach (self::DEFAULT_SYSTEM_PERMISSIONS as $permissionName) {
            Permission::firstOrCreate([
                'name' => $permissionName,
                'guard_name' => 'web',
            ]);
        }
    }

    protected function syncSystemRole(User $user, string $roleName, int $tenantId): void
    {
        if (function_exists('setPermissionsTeamId')) {
            setPermissionsTeamId($tenantId);
        }

        $role = Role::query()
            ->where('tenant_id', $tenantId)
            ->where('guard_name', 'web')
            ->where('name', $roleName)
            ->firstOrFail();

        $user->syncRoles([$role]);
    }

    protected function syncSystemPermissions(User $user, array $permissionNames, int $tenantId): void
    {
        if (function_exists('setPermissionsTeamId')) {
            setPermissionsTeamId($tenantId);
        }

        $permissions = Permission::query()
            ->where('guard_name', 'web')
            ->whereIn('name', collect($permissionNames)->filter()->values())
            ->get();

        $user->syncPermissions($permissions);
    }

    protected function syncSystemPermissionSelection(User $user, string $roleName, array $selectedPermissionNames, int $tenantId): void
    {
        $selectedPermissions = $this->normalizeSystemPermissionSelection($selectedPermissionNames);
        $rolePermissions = collect(self::DEFAULT_ROLE_PERMISSIONS[$roleName] ?? [])
            ->filter(fn ($name) => str_starts_with((string) $name, 'system.'))
            ->values()
            ->all();

        $directPermissions = array_values(array_diff($selectedPermissions, $rolePermissions));

        $this->syncSystemPermissions($user, $directPermissions, $tenantId);
        $this->storeSystemPermissionOverride($user, $selectedPermissions);
    }

    protected function syncDefaultRolePermissions(Role $role, int $tenantId): void
    {
        $permissionNames = self::DEFAULT_ROLE_PERMISSIONS[$role->name] ?? null;

        if ($permissionNames === null) {
            return;
        }

        if (function_exists('setPermissionsTeamId')) {
            setPermissionsTeamId($tenantId);
        }

        $permissions = Permission::query()
            ->where('guard_name', 'web')
            ->whereIn('name', $permissionNames)
            ->get();

        $role->syncPermissions($permissions);
    }

    protected function rolePriority(string $roleName): int
    {
        $priority = [
            'Platform Owner' => 1,
            'system admin' => 2,
            'Platform Admin' => 3,
            'Operations Admin' => 4,
            'Audit Manager' => 5,
            'Support Admin' => 6,
        ];

        return $priority[$roleName] ?? 100;
    }

    protected function ensureSystemUser(User $user, int $tenantId): void
    {
        if (!$user->is_super_admin || (int) $user->tenant_id !== $tenantId) {
            abort(404);
        }
    }

    protected function ensureSystemRole(Role $role, int $tenantId): void
    {
        if ((int) $role->tenant_id !== $tenantId || $role->guard_name !== 'web') {
            abort(404);
        }
    }

    protected function activeUsersCount(int $tenantId): int
    {
        return User::withoutGlobalScope('tenant')
            ->where('is_super_admin', true)
            ->where('tenant_id', $tenantId)
            ->where(function ($statusQuery) {
                $statusQuery->where('status', 'Active')->orWhereNull('status');
            })
            ->count();
    }

    protected function normalizeSystemPermissionSelection(array $permissionNames): array
    {
        return Permission::query()
            ->where('guard_name', 'web')
            ->where('name', 'like', 'system.%')
            ->whereIn('name', collect($permissionNames)->filter()->values())
            ->pluck('name')
            ->values()
            ->all();
    }

    protected function storeSystemPermissionOverride(User $user, array $permissionNames): void
    {
        $metaData = is_array($user->meta_data) ? $user->meta_data : [];
        $metaData['system_permissions_override'] = array_values($permissionNames);
        $user->meta_data = $metaData;
        $user->save();
    }

    protected function resolveSystemPermissionSelection(User $user, int $tenantId): array
    {
        $override = data_get($user->meta_data, 'system_permissions_override');
        if (is_array($override)) {
            return $this->normalizeSystemPermissionSelection($override);
        }

        $rolePermissions = $user->roles
            ->where('tenant_id', $tenantId)
            ->flatMap(fn ($role) => self::DEFAULT_ROLE_PERMISSIONS[$role->name] ?? [])
            ->filter(fn ($name) => str_starts_with((string) $name, 'system.'))
            ->values();

        $directPermissions = $user->permissions
            ->where('guard_name', 'web')
            ->pluck('name')
            ->filter(fn ($name) => str_starts_with((string) $name, 'system.'))
            ->values();

        return $rolePermissions
            ->merge($directPermissions)
            ->unique()
            ->values()
            ->all();
    }

    protected function serializeUser(User $user, int $tenantId): array
    {
        $roles = $user->roles
            ->where('tenant_id', $tenantId)
            ->pluck('name')
            ->values();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'status' => $user->status ?: 'Active',
            'is_super_admin' => (bool) $user->is_super_admin,
            'role' => $roles->first(),
            'roles' => $roles,
            'permissions' => $this->resolveSystemPermissionSelection($user, $tenantId),
            'created_at' => optional($user->created_at)->toISOString(),
            'updated_at' => optional($user->updated_at)->toISOString(),
        ];
    }

    protected function permissionGroup(string $permissionName): string
    {
        $parts = explode('.', $permissionName);
        return $parts[1] ?? 'general';
    }

    protected function permissionLabel(string $permissionName): string
    {
        $dashboardLabels = [
            'system.dashboard.view' => 'Dashboard / View',
            'system.dashboard.kpis' => 'Dashboard / KPI Cards',
            'system.dashboard.health' => 'Dashboard / Platform Health',
            'system.dashboard.growth' => 'Dashboard / Growth Chart',
            'system.dashboard.plan_distribution' => 'Dashboard / Plan Distribution',
            'system.dashboard.status_breakdown' => 'Dashboard / Status Breakdown',
            'system.dashboard.recent_tenants' => 'Dashboard / Recent Tenants',
            'system.dashboard.expiring_soon' => 'Dashboard / Expiring Soon',
        ];

        if (isset($dashboardLabels[$permissionName])) {
            return $dashboardLabels[$permissionName];
        }

        $parts = explode('.', $permissionName);
        $tail = array_slice($parts, 1);
        return collect($tail)
            ->map(fn ($segment) => ucfirst(str_replace('_', ' ', $segment)))
            ->implode(' / ');
    }
}
