<?php

namespace App\Support;

use App\Models\User;

trait AppliesAgencyScope
{
    protected function isAgencyScopedMarketingUser(?User $user): bool
    {
        return $user?->isAgencyScopedMarketingUser() ?? false;
    }

    protected function currentAgencyId(?User $user): ?string
    {
        $agencyId = trim((string) ($user?->agency_id ?? ''));
        return $agencyId !== '' ? $agencyId : null;
    }

    protected function applyAgencyScope($query, ?User $user, string $column = 'agency_id')
    {
        if ($this->isAgencyScopedMarketingUser($user) && $this->currentAgencyId($user)) {
            $query->where($column, $this->currentAgencyId($user));
        }

        return $query;
    }

    protected function resolveAgencyIdForWrite($request, ?User $user): ?string
    {
        if ($this->isAgencyScopedMarketingUser($user)) {
            return $this->currentAgencyId($user);
        }

        $value = trim((string) $request->input('agency_id', ''));
        return $value !== '' ? $value : null;
    }

    protected function ensureAgencyOwnership(?User $user, $model, string $column = 'agency_id'): void
    {
        if (!$this->isAgencyScopedMarketingUser($user)) {
            return;
        }

        $expectedAgencyId = $this->currentAgencyId($user);
        $actualAgencyId = trim((string) data_get($model, $column, ''));

        if ($expectedAgencyId === null || $actualAgencyId !== $expectedAgencyId) {
            abort(404);
        }
    }
}
