<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use App\Models\Tenant;
use App\Services\AdminEventNotificationService;
use App\Services\TenantBootstrapper;
use App\Services\UserPanelContextService;
use App\Mail\TwoFactorCodeEmail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

class AuthController extends Controller
{
    public function __construct(
        private readonly UserPanelContextService $panelContext,
        private readonly \App\Services\AdminImpersonationService $impersonationService
    ) {
    }

    protected function resolvedUserPermissions(User $user)
    {
        try {
            $allPermissions = $user->getAllPermissions()->pluck('name')->values();
            $override = data_get($user->meta_data, 'system_permissions_override');

            if (!$user->is_super_admin || !is_array($override)) {
                return $allPermissions;
            }

            $nonSystemPermissions = $allPermissions
                ->filter(fn ($name) => !str_starts_with((string) $name, 'system.'))
                ->values();

            return $nonSystemPermissions
                ->merge(collect($override)->filter(fn ($name) => str_starts_with((string) $name, 'system.')))
                ->unique()
                ->values();
        } catch (\Throwable $e) {
            return collect();
        }
    }

    protected function tenantBlockedReason(?\App\Models\Tenant $tenant): ?string
    {
        if (!$tenant) return null;

        $status = strtolower((string) ($tenant->status ?? ''));
        if (in_array($status, ['cancelled', 'suspended'], true)) {
            return $status;
        }

        if ($status === 'expired') {
            return 'subscription_expired';
        }

        if (!$tenant->end_date) return null;
        try {
            return now()->greaterThan($tenant->end_date->copy()->endOfDay()) ? 'subscription_expired' : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    protected function tenantIsExpired(?\App\Models\Tenant $tenant): bool
    {
        return $this->tenantBlockedReason($tenant) === 'subscription_expired';
    }

    protected function subscriptionExpiredResponse(?\App\Models\Tenant $tenant)
    {
        return response()->json([
            'code' => 'subscription_expired',
            'message' => 'Your subscription has expired. Please contact customer service to renew your subscription.',
            'message_ar' => 'انتهى الاشتراك. برجاء تجديد الاشتراك للمتابعة.',
            'end_date' => $tenant?->end_date?->toDateString(),
            'support_message_ar' => 'انتهى الاشتراك. لو سمحت توجه لخدمة العملاء لتجديد الاشتراك.',
        ], 403);
    }

    protected function tenantInactiveResponse(?\App\Models\Tenant $tenant, string $reason)
    {
        $status = strtolower($reason);

        return response()->json([
            'code' => 'tenant_inactive',
            'reason' => $status,
            'message' => $status === 'cancelled'
                ? 'This workspace has been cancelled. Please contact customer service for assistance.'
                : 'This workspace has been suspended. Please contact customer service for assistance.',
            'message_ar' => $status === 'cancelled'
                ? 'تم إلغاء مساحة العمل. برجاء التواصل مع خدمة العملاء للمساعدة.'
                : 'تم تعليق مساحة العمل. برجاء التواصل مع خدمة العملاء للمساعدة.',
        ], 403);
    }

    protected function blockedTenantResponse(?\App\Models\Tenant $tenant)
    {
        $reason = $this->tenantBlockedReason($tenant);
        if ($reason === 'subscription_expired') {
            return $this->subscriptionExpiredResponse($tenant);
        }

        if (in_array($reason, ['cancelled', 'suspended'], true)) {
            return $this->tenantInactiveResponse($tenant, $reason);
        }

        return null;
    }

    protected function activateTenantContext(Tenant $tenant): void
    {
        app()->instance('tenant', $tenant);
        app()->instance('current_tenant_id', $tenant->id);
        setPermissionsTeamId($tenant->id);
        $tenant->makeCurrent();
    }

    protected function clearTenantContext(): void
    {
        Tenant::forgetCurrent();
        app()->forgetInstance('tenant');
        app()->forgetInstance('current_tenant_id');
        setPermissionsTeamId(null);
    }

    protected function findUserWithinTenant(Tenant $tenant, string $email): ?User
    {
        if ($tenant->tenancy_type === 'dedicated') {
            try {
                $this->activateTenantContext($tenant);

                return User::withoutGlobalScopes()
                    ->where('email', $email)
                    ->first();
            } finally {
                $this->clearTenantContext();
            }
        }

        return \App\Models\SharedUser::query()
            ->withoutGlobalScopes()
            ->where('email', $email)
            ->first();
    }

    protected function findDedicatedUserAcrossTenants(string $email): ?array
    {
        foreach (Tenant::query()->where('tenancy_type', 'dedicated')->cursor() as $candidateTenant) {
            $user = $this->findUserWithinTenant($candidateTenant, $email);

            if ($user) {
                return ['user' => $user, 'tenant' => $candidateTenant];
            }
        }

        return null;
    }

    protected function resolveLoginContext(Request $request, ?\App\Models\Tenant $tenant): array
    {
        if ($tenant) {
            return [
                'user' => $this->findUserWithinTenant($tenant, (string) $request->email),
                'tenant' => $tenant,
            ];
        }

        $sharedSuperAdmin = \App\Models\SharedUser::query()
            ->withoutGlobalScopes()
            ->where('email', $request->email)
            ->where('is_super_admin', true)
            ->first();

        if ($sharedSuperAdmin) {
            return ['user' => $sharedSuperAdmin, 'tenant' => null];
        }

        $landlordSuperAdmin = \App\Models\LandlordUser::query()
            ->withoutGlobalScopes()
            ->where('email', $request->email)
            ->where('is_super_admin', true)
            ->first();

        if ($landlordSuperAdmin) {
            return ['user' => $landlordSuperAdmin, 'tenant' => null];
        }

        $sharedUser = \App\Models\SharedUser::query()
            ->withoutGlobalScopes()
            ->where('email', $request->email)
            ->first();

        if ($sharedUser) {
            return ['user' => $sharedUser, 'tenant' => null];
        }

        return $this->findDedicatedUserAcrossTenants((string) $request->email) ?? ['user' => null, 'tenant' => null];
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
            'subdomain' => 'nullable|string',
        ]);

        $tenant = app(\App\Contracts\TenantResolverInterface::class)->resolveFromRequest($request);
        $loginContext = $this->resolveLoginContext($request, $tenant);
        $user = $loginContext['user'];
        $tenant = $loginContext['tenant'];

        if ($tenant instanceof Tenant && (!app()->bound('tenant') || !app('tenant'))) {
            $this->activateTenantContext($tenant);
        }

        if ($user) {
            \Illuminate\Support\Facades\Log::info('Login attempt for: ' . $request->email . ' | User Found: ' . $user->id);
        } else {
            \Illuminate\Support\Facades\Log::warning('Login attempt for: ' . $request->email . ' | User NOT Found');
        }

        $authOk = app(\App\Contracts\AuthenticatorInterface::class)->verifyCredentials($user, (string) $request->password);
        \Illuminate\Support\Facades\Log::info('Auth login:credentials_checked', [
            'email' => $request->email,
            'auth_ok' => $authOk,
            'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
        ]);
        if (!$authOk) {
            \Illuminate\Support\Facades\Log::warning('Login failed: Invalid credentials for ' . $request->email);
            if ($user?->is_super_admin) {
                app(AdminEventNotificationService::class)->safe(function () use ($request, $user) {
                    app(AdminEventNotificationService::class)->notifySecurityWarning(
                        'Super admin login failure',
                        "Failed login attempt detected for super admin {$user->email}.",
                        [
                            'user_id' => $user->id,
                            'email' => $user->email,
                            'ip' => $request->ip(),
                            'user_agent' => $request->userAgent(),
                        ]
                    );
                });
            }
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        // 2.a Block inactive users
        if (strcasecmp($user->status ?? '', 'Inactive') === 0) {
            // Invalidate any existing tokens for safety
            $user->tokens()->delete();
            return response()->json(['message' => 'Your account is inactive. Please contact your administrator.'], 403);
        }

        if ($tenant) {
            \Illuminate\Support\Facades\Log::info('Auth login:tenant_context_present', [
                'tenant_id' => $tenant->id,
                'tenant_type' => $tenant->tenancy_type,
                'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
            ]);
            if ($user->tenant_id !== $tenant->id && !$user->is_super_admin) {
                return response()->json(['message' => 'You do not have access to this workspace'], 403);
            }
            if (!app()->bound('tenant')) {
                app()->instance('tenant', $tenant);
            }

            if (!$user->is_super_admin && $this->tenantBlockedReason($tenant)) {
                // Invalidate any existing tokens for safety
                try { $user->tokens()->delete(); } catch (\Throwable $e) {}
                return $this->blockedTenantResponse($tenant);
            }
        } else {
            if (!$user->is_super_admin) {
                // allow root-domain login to compute redirect only (no tenant binding here)
            }
        }

        $tenant = app()->bound('tenant') ? app('tenant') : $tenant;
        \Illuminate\Support\Facades\Log::info('Auth login:pre_2fa', [
            'tenant_id' => $tenant?->id,
            'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
        ]);

        // Final check
        if ($tenant && $user->tenant_id !== $tenant->id && !$user->is_super_admin) {
            return response()->json(['message' => 'User does not belong to this tenant'], 403);
        }

        // If tenant wasn't resolved from the request, check user's tenant (root-domain login flow)
        if (!$user->is_super_admin && !$tenant && $user->tenant_id) {
            try {
                $tenantFromUser = \App\Models\Tenant::find($user->tenant_id);
                if ($this->tenantBlockedReason($tenantFromUser)) {
                    try { $user->tokens()->delete(); } catch (\Throwable $e) {}
                    return $this->blockedTenantResponse($tenantFromUser);
                }
            } catch (\Throwable $e) {
            }
        }

        if (app(\App\Contracts\TwoFactorInterface::class)->isEnabled($user)) {
            app(\App\Contracts\TwoFactorInterface::class)->generateAndSend($user);
            return response()->json(['requires_2fa' => true, 'message' => 'Two-factor authentication code sent']);
        }

        \Illuminate\Support\Facades\Log::info('Auth login:before_issue_token', [
            'user_id' => $user->id,
            'tenant_id' => $tenant?->id,
            'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
        ]);

        return $this->issueToken($user, $request, $tenant);
    }

    public function verifyTwoFactor(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'code' => 'required|string',
            'subdomain' => 'nullable|string',
        ]);

        $tenant = app()->bound('tenant') ? app('tenant') : null;
        $loginContext = $this->resolveLoginContext($request, $tenant);
        $user = $loginContext['user'];
        $tenant = $loginContext['tenant'];

        if ($tenant instanceof Tenant && (!app()->bound('tenant') || !app('tenant'))) {
            $this->activateTenantContext($tenant);
        }

        if (!$user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        if (strcasecmp($user->status ?? '', 'Inactive') === 0) {
            $user->tokens()->delete();
            return response()->json(['message' => 'Your account is inactive. Please contact your administrator.'], 403);
        }

        if (!app(\App\Contracts\TwoFactorInterface::class)->verify($user, (string) $request->code)) {
            return response()->json(['message' => 'Invalid or expired verification code'], 401);
        }

        app(\App\Contracts\TwoFactorInterface::class)->clear($user);

        // ResolveTenant/InitializeTenancy already established the dedicated connection.
        $tenant = app()->bound('tenant') ? app('tenant') : $tenant;
        if ($tenant) {
            app()->instance('tenant', $tenant);
            if ($user->tenant_id !== $tenant->id && !$user->is_super_admin) {
                return response()->json(['message' => 'You do not have access to this workspace'], 403);
            }
            if (!$user->is_super_admin && $this->tenantBlockedReason($tenant)) {
                try { $user->tokens()->delete(); } catch (\Throwable $e) {}
                return $this->blockedTenantResponse($tenant);
            }
        } else if (!$user->is_super_admin) {
            return response()->json(['message' => 'Workspace domain required'], 403);
        }

        return $this->issueToken($user, $request, $tenant);
    }

    protected function issueToken($user, $request, $tenant)
    {
        \Illuminate\Support\Facades\Log::info('Auth issueToken:start', [
            'user_id' => $user->id,
            'tenant_id' => $tenant?->id,
            'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
        ]);

        $token = app(\App\Contracts\TokenIssuerInterface::class)->issue($user, $request);
        \Illuminate\Support\Facades\Log::info('Auth issueToken:token_issued', [
            'user_id' => $user->id,
            'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
        ]);

        try {
            activity('auth')
                ->causedBy($user)
                ->withProperties(['ip' => $request->ip(), 'user_agent' => $request->userAgent()])
                ->log('logged_in');
        } catch (\Throwable $e) {
        }
        \Illuminate\Support\Facades\Log::info('Auth issueToken:activity_logged', [
            'user_id' => $user->id,
            'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
        ]);

        $impersonation = $this->resolveImpersonationPayload();
        $profileTenant = $this->panelContext->resolveTenantForProfile($user, $tenant, $impersonation);
        \Illuminate\Support\Facades\Log::info('Auth issueToken:tenant_resolved', [
            'user_id' => $user->id,
            'profile_tenant_id' => $profileTenant?->id,
            'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
        ]);
        $panelPayload = $this->panelContext->buildPayload($user, $profileTenant, $impersonation);
        \Illuminate\Support\Facades\Log::info('Auth issueToken:panel_built', [
            'user_id' => $user->id,
            'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
        ]);
        $enabledModules = $this->resolveEnabledModules($user, $profileTenant, $panelPayload);
        \Illuminate\Support\Facades\Log::info('Auth issueToken:modules_resolved', [
            'user_id' => $user->id,
            'modules_count' => is_countable($enabledModules) ? count($enabledModules) : null,
            'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
        ]);
        $serializedUser = $this->serializeAuthUser($user);
        \Illuminate\Support\Facades\Log::info('Auth issueToken:user_serialized', [
            'user_id' => $user->id,
            'memory_mb' => round(memory_get_usage(true) / 1048576, 2),
        ]);

        return response()->json(array_merge([
            'token' => $token,
            'redirect_url' => $this->resolveFrontendRedirectUrl($user, $profileTenant, $panelPayload),
            'user' => $serializedUser,
            'tenant' => $profileTenant,
            'company' => $profileTenant,
            'enabled_modules' => $enabledModules,
            'user_permissions' => $this->resolvedUserPermissions($user),
            'impersonation' => $impersonation,
            'tenant_subdomain_url' => $this->resolveTenantSubdomainUrl($profileTenant),
        ], $panelPayload));
    }

    public function me(Request $request)
    {
        $user = $request->user();
        $boundTenant = app()->bound('tenant') ? app('tenant') : null;
        $impersonation = $this->resolveImpersonationPayload();
        $tenant = $this->panelContext->resolveTenantForProfile($user, $boundTenant, $impersonation);
        if ($tenant) {
            $tenant->refresh();
        }
        $panelPayload = $this->panelContext->buildPayload($user, $tenant, $impersonation);

        if (!$tenant && !$this->panelContext->isSystemAdmin($user)) {
            return response()->json(['message' => 'Workspace domain required'], 403);
        }

        return response()->json(array_merge([
            'user' => $this->serializeAuthUser($user),
            'tenant' => $tenant,
            'company' => $tenant,
            'enabled_modules' => $this->resolveEnabledModules($user, $tenant, $panelPayload),
            'user_permissions' => $this->resolvedUserPermissions($user),
            'impersonation' => $impersonation,
            'subdomain_url' => $this->resolveTenantSubdomainUrl($tenant),
        ], $panelPayload));
    }

    protected function resolveImpersonationPayload(): ?array
    {
        if (!app()->bound('impersonation_session')) {
            return null;
        }

        $session = app('impersonation_session');

        return $this->impersonationService->serializeActiveContext($session);
    }

    public function loginRedirect(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
            'subdomain' => 'nullable|string',
        ]);

        $tenant = app(\App\Contracts\TenantResolverInterface::class)->resolveFromRequest($request);
        $loginContext = $this->resolveLoginContext($request, $tenant);
        $user = $loginContext['user'];
        $tenant = $loginContext['tenant'];

        if ($tenant instanceof Tenant && (!app()->bound('tenant') || !app('tenant'))) {
            $this->activateTenantContext($tenant);
        }

        if ($user) {
            \Illuminate\Support\Facades\Log::info('LoginRedirect attempt for: ' . $request->email . ' | User Found: ' . $user->id);
        } else {
            \Illuminate\Support\Facades\Log::warning('LoginRedirect attempt for: ' . $request->email . ' | User NOT Found');
        }

        $authOk = app(\App\Contracts\AuthenticatorInterface::class)->verifyCredentials($user, (string) $request->password);
        if (!$authOk) {
            \Illuminate\Support\Facades\Log::warning('LoginRedirect failed: Invalid credentials for ' . $request->email);
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        if (strcasecmp($user->status ?? '', 'Inactive') === 0) {
            $user->tokens()->delete();
            return response()->json(['message' => 'Your account is inactive. Please contact your administrator.'], 403);
        }

        if ($tenant) {
            if ($user->tenant_id !== $tenant->id && !$user->is_super_admin) {
                return response()->json(['message' => 'You do not have access to this workspace'], 403);
            }
            if (!app()->bound('tenant')) {
                app()->instance('tenant', $tenant);
            }
            if (!$user->is_super_admin && $this->tenantBlockedReason($tenant)) {
                try { $user->tokens()->delete(); } catch (\Throwable $e) {}
                return $this->blockedTenantResponse($tenant);
            }
        } else {
            if (!$user->is_super_admin && $user->tenant_id) {
                try {
                    $tenantFromUser = \App\Models\Tenant::find($user->tenant_id);
                    if ($this->tenantBlockedReason($tenantFromUser)) {
                        try { $user->tokens()->delete(); } catch (\Throwable $e) {}
                        return $this->blockedTenantResponse($tenantFromUser);
                    }
                } catch (\Throwable $e) {
                }
            }
        }

        $tenant = app()->bound('tenant') ? app('tenant') : null;
        if ($tenant && $user->tenant_id !== $tenant->id && !$user->is_super_admin) {
            return response()->json(['message' => 'User does not belong to this tenant'], 403);
        }

        $newToken = $user->createToken('auth_token');
        $token = $newToken->plainTextToken;

        // Device metadata stored by TokenIssuer

        if ($request->wantsJson()) {
            $impersonation = $this->resolveImpersonationPayload();
            $profileTenant = $this->panelContext->resolveTenantForProfile($user, $tenant, $impersonation);
            $panelPayload = $this->panelContext->buildPayload($user, $profileTenant, $impersonation);

            return response()->json(array_merge([
                'token' => $token,
                'user' => $this->serializeAuthUser($user),
                'tenant' => $profileTenant,
                'company' => $profileTenant,
                'enabled_modules' => $this->resolveEnabledModules($user, $profileTenant, $panelPayload),
                'user_permissions' => $this->resolvedUserPermissions($user),
                'impersonation' => $impersonation,
                'redirect_url' => $this->resolveFrontendRedirectUrl($user, $profileTenant, $panelPayload),
            ], $panelPayload));
        }

        $impersonation = $this->resolveImpersonationPayload();
        $profileTenant = $this->panelContext->resolveTenantForProfile($user, $tenant, $impersonation);
        $panelPayload = $this->panelContext->buildPayload($user, $profileTenant, $impersonation);
        $frontendUrl = $this->resolveFrontendRedirectUrl($user, $profileTenant, $panelPayload);

        return redirect()->away($frontendUrl . '/auth/callback?token=' . $token);
    }

    protected function serializeAuthUser(User $user): array
    {
        $previousTeamId = getPermissionsTeamId();

        try {
            if ($user->tenant_id) {
                setPermissionsTeamId($user->tenant_id);
            }

            $user->unsetRelation('roles');
            $user->load('roles');

            $tenant = app()->bound('tenant') ? app('tenant') : null;
            if (!$tenant && $user->tenant_id) {
                $tenant = Tenant::query()->find($user->tenant_id);
            }

            if ($tenant && $user->roles->isEmpty() && $this->isPrimaryTenantAdmin($user)) {
                app(TenantBootstrapper::class)->ensureTenantAdminRole($user, $tenant);
                $user->unsetRelation('roles');
                $user->load('roles');
            }
        } finally {
            setPermissionsTeamId($previousTeamId);
        }

        $data = $user->toArray();
        $data['is_super_admin'] = $this->panelContext->isSystemAdmin($user);
        $data['is_primary_admin'] = $this->isPrimaryTenantAdmin($user);

        if (empty($data['role'])) {
            $data['role'] = $user->roles->first()?->name ?? $user->job_title;
        }

        if (empty($data['role']) && !empty($data['is_primary_admin'])) {
            $data['role'] = 'Tenant Admin';
        }

        return $data;
    }

    protected function isPrimaryTenantAdmin(User $user): bool
    {
        if ($user->is_super_admin) {
            return true;
        }

        $tenant = app()->bound('tenant') ? app('tenant') : null;
        if (!$tenant && $user->tenant_id) {
            $tenant = Tenant::query()->find($user->tenant_id);
        }

        if (!$tenant) {
            return false;
        }

        $owner = User::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->orderBy('id')
            ->first();

        return $owner && (int) $owner->id === (int) $user->id;
    }

    protected function resolveEnabledModules(User $user, ?Tenant $tenant, array $panelPayload): array
    {
        if (($panelPayload['panel_mode'] ?? null) === 'system') {
            try {
                return \App\Models\Module::all()->all();
            } catch (\Throwable $e) {
                return [];
            }
        }

        if ($tenant) {
            try {
                return app(\App\Services\ModuleService::class)->enabledForTenant($tenant);
            } catch (\Throwable $e) {
                try {
                    return $tenant->modules()->wherePivot('is_enabled', true)->get()->all();
                } catch (\Throwable $e2) {
                    return [];
                }
            }
        }

        return [];
    }

    protected function resolveFrontendRedirectUrl(User $user, ?Tenant $tenant, array $panelPayload): string
    {
        $frontendBase = config('app.frontend_url', 'https://besouholacrm.net');
        $frontendHost = parse_url($frontendBase, PHP_URL_HOST) ?? 'besouholacrm.net';
        $frontendScheme = parse_url($frontendBase, PHP_URL_SCHEME) ?? 'https';
        $frontendPort = parse_url($frontendBase, PHP_URL_PORT);
        $portSuffix = $frontendPort ? ':' . $frontendPort : '';

        if (($panelPayload['panel_mode'] ?? null) === 'system') {
            return $frontendBase;
        }

        if ($tenant) {
            return $frontendScheme . '://' . $tenant->slug . '.' . $frontendHost . $portSuffix;
        }

        return $frontendBase;
    }

    protected function resolveTenantSubdomainUrl(?Tenant $tenant): ?string
    {
        if (!$tenant) {
            return null;
        }

        $frontendBase = config('app.frontend_url', 'https://besouholacrm.net');
        $frontendHost = parse_url($frontendBase, PHP_URL_HOST) ?? 'besouholacrm.net';
        $frontendScheme = parse_url($frontendBase, PHP_URL_SCHEME) ?? 'https';
        $frontendPort = parse_url($frontendBase, PHP_URL_PORT);
        $portSuffix = $frontendPort ? ':' . $frontendPort : '';

        return $frontendScheme . '://' . $tenant->slug . '.' . $frontendHost . $portSuffix;
    }

    protected function resolveTenantFromHost(Request $request): ?Tenant
    {
        $host = $request->getHost();
        $rootDomain = config('app.root_domain', 'besouholacrm.net');
        if ($host === $rootDomain) {
            return null;
        }
        if (!str_ends_with($host, '.' . $rootDomain)) {
            return null;
        }
        $subdomain = substr($host, 0, -strlen('.' . $rootDomain));
        if (!$subdomain) {
            return null;
        }
        if (!preg_match('/^[a-z0-9-]+$/', $subdomain)) {
            return null;
        }
        return Tenant::where('slug', $subdomain)->first();
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully']);
    }

    public function updateCompany(Request $request)
    {
        $request->validate([
            'name' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'logo' => 'nullable|image|max:2048', // 2MB Max
            'country' => 'nullable|string',
            'city' => 'nullable|string',
            'state' => 'nullable|string',
            'address_line_1' => 'nullable|string',
            'address_line_2' => 'nullable|string',
            'phone' => 'nullable|string',
            'tax_id' => 'nullable|string',
            'website_url' => 'nullable|string|url',
        ]);

        $user = $request->user();
        $tenant = $user->is_super_admin
            ? (app()->bound('tenant') ? app('tenant') : null)
            : ($user->tenant_id ? Tenant::find($user->tenant_id) : null);

        if (!$tenant || (!$user->is_super_admin && (int) $user->tenant_id !== (int) $tenant->id)) {
            return response()->json(['message' => 'Invalid tenant context'], 403);
        }

        if ($request->has('name')) {
            $tenant->name = $request->name;
        }

        // Update profile JSON
        $profile = $tenant->profile ?? [];

        if ($request->has('description')) {
            $profile['description'] = $request->description;
        }
        if ($request->has('phone')) {
            $profile['phone'] = $request->phone;
        }
        if ($request->has('tax_id')) {
            $profile['tax_id'] = $request->tax_id;
        }
        if ($request->has('website_url')) {
            $profile['website_url'] = $request->website_url;
        }

        // Handle Logo Upload
        if ($request->hasFile('logo')) {
            $path = $request->file('logo')->store('company-logos', 'public');
            // Generate full URL
            $profile['logo_url'] = asset('storage/' . $path);
        }

        $tenant->profile = $profile;

        // Update Location Details
        if ($request->has('country'))
            $tenant->country = $request->country;
        if ($request->has('city'))
            $tenant->city = $request->city;
        if ($request->has('state'))
            $tenant->state = $request->state;
        if ($request->has('address_line_1'))
            $tenant->address_line_1 = $request->address_line_1;
        if ($request->has('address_line_2'))
            $tenant->address_line_2 = $request->address_line_2;
        if (
            $request->has('website_url')
            && Schema::connection($tenant->getConnectionName())->hasColumn($tenant->getTable(), 'website_url')
        ) {
            $tenant->website_url = $request->website_url;
        }

        $tenant->save();

        return response()->json([
            'message' => 'Company settings updated successfully',
            'tenant' => $tenant
        ]);
    }
}
