<?php

namespace App\Support;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Http\Request;

trait AppliesMetaAgencyScope
{
    protected function isMetaTenantAdmin(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if ($user->is_super_admin) {
            return true;
        }

        $previousTeamId = getPermissionsTeamId();
        try {
            if ($user->tenant_id) {
                setPermissionsTeamId($user->tenant_id);
            }

            if (method_exists($user, 'hasAnyRole') && $user->hasAnyRole(['Tenant Admin', 'Admin'])) {
                return true;
            }
        } finally {
            setPermissionsTeamId($previousTeamId);
        }

        $roleLower = strtolower(trim((string) ($user->role ?? $user->job_title ?? '')));

        return in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'owner'], true);
    }

    protected function normalizeMetaAgencyKey(mixed $value): ?string
    {
        $normalized = trim((string) ($value ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    /**
     * @return array{agency_id: ?string, error: ?string}
     */
    protected function resolveTargetAgencyId(Request $request, User $user): array
    {
        $lockedAgencyId = $this->normalizeMetaAgencyKey($user->agency_id);
        if ($lockedAgencyId && !$this->isMetaTenantAdmin($user)) {
            return ['agency_id' => $lockedAgencyId, 'error' => null];
        }

        if (!$this->isMetaTenantAdmin($user)) {
            return ['agency_id' => null, 'error' => null];
        }

        $requested = $this->normalizeMetaAgencyKey($request->input('agency_id'));
        if (!$requested) {
            return [
                'agency_id' => null,
                'error' => 'agency_id is required to connect a Meta account.',
            ];
        }

        $exists = Agency::where('tenant_id', $user->tenant_id)
            ->where('key', $requested)
            ->exists();

        if (!$exists) {
            return ['agency_id' => null, 'error' => 'Agency not found.'];
        }

        return ['agency_id' => $requested, 'error' => null];
    }

    protected function resolveMetaAgencyFilter(Request $request, User $user): ?string
    {
        $lockedAgencyId = $this->normalizeMetaAgencyKey($user->agency_id);
        if ($lockedAgencyId && !$this->isMetaTenantAdmin($user)) {
            return $lockedAgencyId;
        }

        if ($this->isMetaTenantAdmin($user)) {
            return $this->normalizeMetaAgencyKey($request->query('agency_id'));
        }

        return null;
    }

    protected function applyMetaAgencyFilter($query, ?string $agencyFilter, string $column = 'agency_id')
    {
        if ($agencyFilter) {
            $query->where($column, $agencyFilter);
        }

        return $query;
    }

    protected function hasMetaConnectionForAgency(int|string $tenantId, ?string $agencyId): bool
    {
        $query = \App\Models\MetaConnection::where('tenant_id', $tenantId);

        if ($agencyId) {
            $query->where('agency_id', $agencyId);
        } else {
            $query->whereNull('agency_id');
        }

        return $query->exists();
    }

    protected function deleteMetaAssetsForAgency(int|string $tenantId, ?string $agencyId): void
    {
        $pageDelete = \App\Models\MetaPage::where('tenant_id', $tenantId);
        $adDelete = \App\Models\MetaAdAccount::where('tenant_id', $tenantId);
        $businessDelete = \App\Models\MetaBusiness::where('tenant_id', $tenantId);

        $this->applyMetaAgencyFilter($pageDelete, $agencyId);
        $this->applyMetaAgencyFilter($adDelete, $agencyId);
        $this->applyMetaAgencyFilter($businessDelete, $agencyId);

        $pageDelete->delete();
        $adDelete->delete();
        $businessDelete->delete();
    }
}
