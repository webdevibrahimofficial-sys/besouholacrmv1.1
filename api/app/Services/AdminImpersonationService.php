<?php

namespace App\Services;

use App\Models\AdminImpersonationSession;
use App\Models\LandlordUser;
use App\Models\PersonalAccessToken;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

class AdminImpersonationService
{
    public function __construct(
        private readonly SystemAdminPermissionService $systemAdminPermissions,
        private readonly TenantBootstrapper $tenantBootstrapper
    ) {
    }

    public const STATUS_ACTIVE = 'active';
    public const STATUS_ENDED = 'ended';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_REVOKED = 'revoked';
    public const MODE_SUPPORT_ACCESS = 'support_access';
    protected ?bool $impersonationStorageAvailable = null;

    public function ensureActorCanImpersonate(User $user): void
    {
        $this->systemAdminPermissions->ensureCanImpersonateTenants($user);
    }

    public function listEligibleTenants(Request $request): array
    {
        $search = trim((string) $request->input('search', ''));
        $status = trim((string) $request->input('status', 'active'));
        $limit = min(max((int) $request->integer('limit', 20), 1), 100);

        $query = $this->tenantQuery()
            ->whereNull('archived_at')
            ->withCount(['users' => function ($builder) {
                $builder->withoutGlobalScopes();
            }]);

        if ($status !== '' && $status !== 'all') {
            $query->where('status', $status);
        }

        if ($search !== '') {
            $query->where(function ($builder) use ($search) {
                $builder
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('slug', 'like', "%{$search}%")
                    ->orWhere('domain', 'like', "%{$search}%")
                    ->orWhere('id', is_numeric($search) ? (int) $search : 0);
            });
        }

        return $query
            ->latest()
            ->limit($limit)
            ->get()
            ->map(function (Tenant $tenant) {
                $tenantAdmin = $this->resolvePrimaryTenantUser($tenant);
                return [
                    'id' => $tenant->id,
                    'name' => $tenant->name,
                    'slug' => $tenant->slug,
                    'domain' => $tenant->domain,
                    'status' => $tenant->status,
                    'plan' => $tenant->subscription_plan,
                    'owner_name' => $tenantAdmin?->name,
                    'owner_email' => $tenantAdmin?->email,
                    'users_count' => (int) ($tenant->users_count ?? 0),
                    'last_activity_at' => optional($tenant->updated_at)->toISOString(),
                    'can_impersonate' => $this->canImpersonateTenant($tenant, $tenantAdmin),
                ];
            })
            ->values()
            ->all();
    }

    public function start(User $admin, Tenant $tenant, Request $request, array $payload = []): array
    {
        $this->ensureImpersonationStorageAvailable();
        $this->ensureActorCanImpersonate($admin);

        $tenant = $this->findTenantById($tenant->getKey());
        if (!$tenant) {
            throw new HttpException(404, 'Tenant not found.');
        }

        $tenantAdmin = $this->resolvePrimaryTenantUser($tenant);
        if (!$this->canImpersonateTenant($tenant, $tenantAdmin)) {
            throw new HttpException(422, $tenantAdmin
                ? 'This tenant is not eligible for support access.'
                : 'Cannot open this tenant because no active tenant admin exists.');
        }

        $rawBridgeToken = Str::random(64);
        $session = DB::transaction(function () use ($admin, $tenant, $tenantAdmin, $request, $payload, $rawBridgeToken) {
            AdminImpersonationSession::query()
                ->where('admin_user_id', $admin->id)
                ->where('status', self::STATUS_ACTIVE)
                ->update([
                    'status' => self::STATUS_ENDED,
                    'ended_at' => now(),
                    'ended_reason' => 'superseded',
                    'updated_at' => now(),
                ]);

            return AdminImpersonationSession::query()->create([
                'admin_user_id' => $admin->id,
                'tenant_id' => $tenant->id,
                'tenant_user_id' => $tenantAdmin?->id,
                'mode' => self::MODE_SUPPORT_ACCESS,
                'reason' => $payload['reason'] ?? null,
                'token_hash' => hash('sha256', $rawBridgeToken),
                'status' => self::STATUS_ACTIVE,
                'started_at' => now(),
                'last_seen_at' => now(),
                'expires_at' => now()->addHour(),
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'origin_panel' => 'super_admin',
                'meta_data' => [
                    'mode' => self::MODE_SUPPORT_ACCESS,
                ],
            ]);
        });

        $session->setRelation('tenant', $tenant);
        $redirectUrl = $this->buildTenantCallbackUrl($tenant, $rawBridgeToken);

        return [
            'message' => 'Support access session started.',
            'session' => $this->serializeSession($session->fresh()),
            'tenant' => $this->serializeTenant($tenant),
            'redirect_url' => $redirectUrl,
            'bridge_token' => $rawBridgeToken,
        ];
    }

    public function exchange(string $bridgeToken, Request $request): array
    {
        $this->ensureImpersonationStorageAvailable();
        $session = AdminImpersonationSession::query()
            ->where('status', self::STATUS_ACTIVE)
            ->whereNull('bridge_token_used_at')
            ->where('expires_at', '>', now())
            ->get()
            ->first(function (AdminImpersonationSession $candidate) use ($bridgeToken) {
                return hash_equals((string) $candidate->token_hash, hash('sha256', $bridgeToken));
            });

        if (!$session) {
            throw new AuthenticationException('Invalid or expired impersonation token.');
        }

        $tenant = $this->findTenantById($session->tenant_id);
        if (!$tenant) {
            throw new HttpException(404, 'Tenant not found.');
        }

        $this->activateTenantContext($tenant);

        $admin = LandlordUser::withoutGlobalScopes()->findOrFail($session->admin_user_id);
        $this->ensureActorCanImpersonate($admin);

        $tenantUser = $this->resolveWorkspaceTenantUser($tenant, $session->tenant_user_id);
        $supportToken = $tenantUser->createToken('support_access');

        if ($supportToken->accessToken) {
            $supportToken->accessToken->forceFill([
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ])->save();
        }

        $session->forceFill([
            'bridge_token_used_at' => now(),
            'support_session_token_id' => $supportToken->accessToken?->id,
            'last_seen_at' => now(),
        ])->save();

        return [
            'message' => 'Support access session established.',
            'token' => $supportToken->plainTextToken,
            'user' => $tenantUser,
            'tenant' => $tenant->only(['id', 'name', 'slug', 'domain']),
            'impersonation' => $this->serializeActiveContext($session),
        ];
    }

    public function currentForAdmin(User $admin): ?AdminImpersonationSession
    {
        if (!$this->impersonationStorageAvailable()) {
            return null;
        }

        $session = AdminImpersonationSession::query()
            ->where('admin_user_id', $admin->id)
            ->where('status', self::STATUS_ACTIVE)
            ->latest('id')
            ->first();

        if ($session && optional($session->expires_at)->isPast()) {
            $this->expire($session);
            return null;
        }

        if ($session) {
            $tenant = $this->findTenantById($session->tenant_id);
            if ($tenant) {
                $session->setRelation('tenant', $tenant);
            }
        }

        return $session;
    }

    public function currentForSupportToken(?PersonalAccessToken $token): ?AdminImpersonationSession
    {
        if (!$token) {
            return null;
        }

        if (!$this->impersonationStorageAvailable()) {
            return null;
        }

        $session = AdminImpersonationSession::query()
            ->where('support_session_token_id', $token->id)
            ->where('status', self::STATUS_ACTIVE)
            ->latest('id')
            ->first();

        if ($session && optional($session->expires_at)->isPast()) {
            $this->expire($session);
            return null;
        }

        if ($session) {
            $tenant = $this->findTenantById($session->tenant_id);
            if ($tenant) {
                $session->setRelation('tenant', $tenant);
            }
        }

        return $session;
    }

    public function end(AdminImpersonationSession $session, ?User $endedBy = null, string $reason = 'manual_exit'): AdminImpersonationSession
    {
        $this->ensureImpersonationStorageAvailable();

        if ($session->support_session_token_id) {
            PersonalAccessToken::query()->whereKey($session->support_session_token_id)->delete();
        }

        $session->forceFill([
            'status' => self::STATUS_ENDED,
            'ended_at' => now(),
            'ended_by' => $endedBy?->id,
            'ended_reason' => $reason,
        ])->save();

        $session = $session->fresh();
        $tenant = $this->findTenantById($session->tenant_id);
        if ($tenant) {
            $session->setRelation('tenant', $tenant);
        }

        return $session;
    }

    public function attachContext(AdminImpersonationSession $session, Request $request): void
    {
        if ($session->status !== self::STATUS_ACTIVE || $session->revoked_at || optional($session->expires_at)->isPast()) {
            $this->expire($session);
            throw new HttpException(401, 'Support access session has expired.');
        }

        $tenant = $this->findTenantById($session->tenant_id);
        if (!$tenant) {
            throw new HttpException(404, 'Tenant not found for support access session.');
        }

        if (!app()->bound('tenant') || (int) app('tenant')->id !== (int) $tenant->id) {
            throw new HttpException(403, 'IMPERSONATION_TENANT_MISMATCH');
        }

        app()->instance('impersonation_session', $session);
        app()->instance('current_tenant_id', $tenant->id);
        setPermissionsTeamId($tenant->id);
        $request->attributes->set('impersonation_session_id', $session->id);
        $request->attributes->set('performed_by_admin_id', $session->admin_user_id);
        $request->attributes->set('is_impersonated', true);

        $lastSeenAt = $session->last_seen_at;
        if (!$lastSeenAt || $lastSeenAt->lte(now()->subMinute())) {
            $session->forceFill(['last_seen_at' => now()])->save();
        }
    }

    public function expire(AdminImpersonationSession $session): void
    {
        if ($session->status !== self::STATUS_ACTIVE) {
            return;
        }

        $session->forceFill([
            'status' => self::STATUS_EXPIRED,
            'ended_at' => now(),
            'ended_reason' => 'expired',
        ])->save();

        activity('super_admin')
            ->performedOn($session->relationLoaded('tenant') ? $session->getRelation('tenant') : $this->findTenantById($session->tenant_id))
            ->withProperties([
                'tenant_id' => $session->tenant_id,
                'session_id' => $session->id,
                'reason' => 'expired',
            ])
            ->event('updated')
            ->log('super_admin_impersonation_expired');
    }

    public function serializeSession(AdminImpersonationSession $session): array
    {
        $tenant = $session->relationLoaded('tenant')
            ? $session->getRelation('tenant')
            : $this->findTenantById($session->tenant_id);
        $admin = LandlordUser::withoutGlobalScopes()->find($session->admin_user_id);

        return [
            'id' => $session->id,
            'tenant_id' => $session->tenant_id,
            'tenant_name' => $tenant?->name,
            'tenant_slug' => $tenant?->slug,
            'admin_user_id' => $session->admin_user_id,
            'admin_name' => $admin?->name,
            'admin_email' => $admin?->email,
            'mode' => $session->mode,
            'reason' => $session->reason,
            'status' => $session->status,
            'started_at' => optional($session->started_at)->toISOString(),
            'expires_at' => optional($session->expires_at)->toISOString(),
            'remaining_seconds' => $session->expires_at ? max(0, now()->diffInSeconds($session->expires_at, false)) : null,
        ];
    }

    public function serializeActiveContext(AdminImpersonationSession $session): array
    {
        $admin = LandlordUser::withoutGlobalScopes()->find($session->admin_user_id);
        $tenant = $session->relationLoaded('tenant')
            ? $session->getRelation('tenant')
            : $this->findTenantById($session->tenant_id);

        return [
            'active' => true,
            'session_id' => $session->id,
            'admin_user_id' => $session->admin_user_id,
            'admin_name' => $admin?->name,
            'admin_email' => $admin?->email,
            'tenant_id' => $session->tenant_id,
            'tenant_name' => $tenant?->name,
            'tenant_slug' => $tenant?->slug,
            'mode' => $session->mode,
            'reason' => $session->reason,
            'expires_at' => optional($session->expires_at)->toISOString(),
            'remaining_seconds' => $session->expires_at ? max(0, now()->diffInSeconds($session->expires_at, false)) : null,
        ];
    }

    protected function canImpersonateTenant(Tenant $tenant, ?User $tenantAdmin): bool
    {
        return !$tenant->archived_at
            && strtolower((string) $tenant->status) === 'active'
            && $tenantAdmin !== null;
    }

    protected function resolvePrimaryTenantUser(Tenant $tenant): ?User
    {
        if ($tenant->tenancy_type === 'dedicated') {
            try {
                $workspaceUser = $tenant->execute(function () use ($tenant) {
                    return User::withoutGlobalScopes()
                        ->where('tenant_id', $tenant->id)
                        ->where('is_super_admin', false)
                        ->where(function ($builder) {
                            $builder->whereNull('status')->orWhere('status', '!=', 'Inactive');
                        })
                        ->orderBy('id')
                        ->first();
                });

                if ($workspaceUser) {
                    return $workspaceUser;
                }
            } catch (Throwable) {
                // Fall back to the landlord copy for older dedicated tenants that were
                // provisioned before workspace users were mirrored correctly.
            }
        }

        return LandlordUser::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->where('is_super_admin', false)
            ->where(function ($builder) {
                $builder->whereNull('status')->orWhere('status', '!=', 'Inactive');
            })
            ->orderBy('id')
            ->first();
    }

    protected function tenantQuery(): Builder
    {
        return Tenant::on(config('multitenancy.landlord_database_connection_name', 'landlord'));
    }

    protected function findTenantById(int|string $tenantId): ?Tenant
    {
        return $this->tenantQuery()->find($tenantId);
    }

    protected function tenantConnection(): string
    {
        return (string) config('multitenancy.landlord_database_connection_name', 'landlord');
    }

    protected function activateTenantContext(Tenant $tenant): void
    {
        if (!app()->bound('tenant') || (int) app('tenant')->id !== (int) $tenant->id) {
            app()->instance('tenant', $tenant);
        }

        app()->instance('current_tenant_id', $tenant->id);

        if (function_exists('setPermissionsTeamId')) {
            setPermissionsTeamId($tenant->id);
        }

        $tenant->makeCurrent();
    }

    protected function resolveWorkspaceTenantUser(Tenant $tenant, int|string|null $preferredUserId = null): User
    {
        $workspaceUser = $tenant->execute(function () use ($tenant, $preferredUserId) {
            $query = User::withoutGlobalScopes()
                ->where('tenant_id', $tenant->id)
                ->where('is_super_admin', false)
                ->where(function ($builder) {
                    $builder->whereNull('status')->orWhere('status', '!=', 'Inactive');
                });

            if ($preferredUserId) {
                $match = (clone $query)->find($preferredUserId);
                if ($match) {
                    return $match;
                }
            }

            return $query->orderBy('id')->first();
        });

        if ($workspaceUser) {
            return $workspaceUser;
        }

        $landlordUser = LandlordUser::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->where('is_super_admin', false)
            ->where(function ($builder) {
                $builder->whereNull('status')->orWhere('status', '!=', 'Inactive');
            })
            ->orderBy('id')
            ->firstOrFail();

        return $tenant->execute(function () use ($tenant, $landlordUser) {
            $mirrored = User::withoutGlobalScopes()
                ->where('tenant_id', $tenant->id)
                ->where('email', $landlordUser->email)
                ->first();

            if (!$mirrored) {
                $mirrored = User::create([
                    'name' => $landlordUser->name,
                    'email' => $landlordUser->email,
                    'password' => $landlordUser->getAuthPassword(),
                    'tenant_id' => $tenant->id,
                    'status' => $landlordUser->status,
                    'job_title' => $landlordUser->job_title,
                    'phone' => $landlordUser->phone,
                    'locale' => $landlordUser->locale,
                    'timezone' => $landlordUser->timezone,
                    'theme_mode' => $landlordUser->theme_mode,
                    'avatar' => $landlordUser->avatar,
                ]);
            }

            try {
                $this->tenantBootstrapper->ensureTenantAdminRole($mirrored, $tenant);
            } catch (Throwable $exception) {
                Log::warning('Unable to assign Tenant Admin role during support-access mirror sync.', [
                    'tenant_id' => $tenant->id,
                    'user_id' => $mirrored->id,
                    'email' => $mirrored->email,
                    'error' => $exception->getMessage(),
                ]);
            }

            return $mirrored;
        });
    }

    protected function serializeTenant(Tenant $tenant): array
    {
        return [
            'id' => $tenant->id,
            'name' => $tenant->name,
            'slug' => $tenant->slug,
            'domain' => $tenant->domain,
            'status' => $tenant->status,
        ];
    }

    protected function buildTenantCallbackUrl(Tenant $tenant, string $bridgeToken): string
    {
        $frontendBase = config('app.frontend_url', 'https://besouholacrm.net');
        $frontendHost = parse_url($frontendBase, PHP_URL_HOST) ?? 'besouholacrm.net';
        $frontendScheme = parse_url($frontendBase, PHP_URL_SCHEME) ?? 'https';
        $frontendPort = parse_url($frontendBase, PHP_URL_PORT);
        $portSuffix = $frontendPort ? ':' . $frontendPort : '';

        return $frontendScheme
            . '://'
            . $tenant->slug
            . '.'
            . $frontendHost
            . $portSuffix
            . '/#/auth/impersonation-callback?token='
            . urlencode($bridgeToken);
    }

    protected function ensureImpersonationStorageAvailable(): void
    {
        if ($this->impersonationStorageAvailable()) {
            return;
        }

        throw new HttpException(503, 'Support access is unavailable until the impersonation storage migration is applied.');
    }

    protected function impersonationStorageAvailable(): bool
    {
        if ($this->impersonationStorageAvailable !== null) {
            return $this->impersonationStorageAvailable;
        }

        try {
            return $this->impersonationStorageAvailable = Schema::hasTable(
                (new AdminImpersonationSession())->getTable()
            );
        } catch (Throwable $exception) {
            report($exception);

            return $this->impersonationStorageAvailable = false;
        }
    }
}
