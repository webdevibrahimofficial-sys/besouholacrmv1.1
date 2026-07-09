<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use App\Models\Tenant;
use App\Services\AdminEventNotificationService;
use App\Services\UserPanelContextService;

use App\Mail\TwoFactorCodeEmail;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Http;

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

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
            'subdomain' => 'nullable|string',
        ]);

        $tenant = app(\App\Contracts\TenantResolverInterface::class)->resolveFromRequest($request);

        // 2. Authenticate User (Bypass Global Scopes)
        $user = User::withoutGlobalScopes()->where('email', $request->email)->first();

        if ($user) {
            \Illuminate\Support\Facades\Log::info('Login attempt for: ' . $request->email . ' | User Found: ' . $user->id);
        } else {
            \Illuminate\Support\Facades\Log::warning('Login attempt for: ' . $request->email . ' | User NOT Found');
        }

        $authOk = app(\App\Contracts\AuthenticatorInterface::class)->verifyCredentials($user, (string) $request->password);
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

        $tenant = app()->bound('tenant') ? app('tenant') : null;

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

        return $this->issueToken($user, $request, $tenant);
    }

    public function verifyTwoFactor(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'code' => 'required|string',
            'subdomain' => 'nullable|string',
        ]);

        $user = User::where('email', $request->email)->first();

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

        // Resolve Tenant strictly from host
        $tenant = app(\App\Contracts\TenantResolverInterface::class)->resolveFromRequest($request);
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
        $token = app(\App\Contracts\TokenIssuerInterface::class)->issue($user, $request);

        try {
            activity('auth')
                ->causedBy($user)
                ->withProperties(['ip' => $request->ip(), 'user_agent' => $request->userAgent()])
                ->log('logged_in');
        } catch (\Throwable $e) {
        }

        $impersonation = $this->resolveImpersonationPayload();
        $profileTenant = $this->panelContext->resolveTenantForProfile($user, $tenant, $impersonation);
        $panelPayload = $this->panelContext->buildPayload($user, $profileTenant, $impersonation);
        $enabledModules = $this->resolveEnabledModules($user, $profileTenant, $panelPayload);

        return response()->json(array_merge([
            'token' => $token,
            'redirect_url' => $this->resolveFrontendRedirectUrl($user, $profileTenant, $panelPayload),
            'user' => $this->serializeAuthUser($user),
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

        $user = User::withoutGlobalScopes()->where('email', $request->email)->first();

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
        $data = $user->toArray();
        $data['is_super_admin'] = $this->panelContext->isSystemAdmin($user);

        return $data;
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
        if ($request->has('website_url'))
            $tenant->website_url = $request->website_url;

        $tenant->save();

        return response()->json([
            'message' => 'Company settings updated successfully',
            'tenant' => $tenant
        ]);
    }
}
