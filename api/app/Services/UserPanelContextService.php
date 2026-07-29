<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Collection;

class UserPanelContextService
{
    public function isSystemAdmin(User $user): bool
    {
        if ($user->is_super_admin) {
            return true;
        }

        return $this->systemPermissions($user)->isNotEmpty();
    }

    public function hasActiveImpersonation(?array $impersonation): bool
    {
        return (bool) ($impersonation['active'] ?? false);
    }

    public function shouldUseSystemPanel(User $user, ?array $impersonation = null): bool
    {
        return $this->isSystemAdmin($user) && !$this->hasActiveImpersonation($impersonation);
    }

    public function resolveTenantForProfile(User $user, ?Tenant $boundTenant = null, ?array $impersonation = null): ?Tenant
    {
        if ($this->shouldUseSystemPanel($user, $impersonation)) {
            return null;
        }

        if ($boundTenant) {
            return $boundTenant;
        }

        if ($user->tenant_id) {
            return Tenant::query()->find($user->tenant_id);
        }

        return null;
    }

    public function buildPayload(User $user, ?Tenant $tenant, ?array $impersonation = null): array
    {
        $isSystemAdmin = $this->isSystemAdmin($user);
        $useSystemPanel = $this->shouldUseSystemPanel($user, $impersonation);

        return [
            'is_system_admin' => $isSystemAdmin,
            'panel_mode' => $useSystemPanel ? 'system' : 'tenant',
            'subscription_plan' => $useSystemPanel
                ? 'super_admin'
                : ($tenant?->subscription_plan),
        ];
    }

    protected function systemPermissions(User $user): Collection
    {
        try {
            return $user->getAllPermissions()
                ->pluck('name')
                ->filter(fn ($name) => str_starts_with((string) $name, 'system.'))
                ->values();
        } catch (\Throwable $e) {
            return collect();
        }
    }
}
