<?php

namespace App\Services;

use App\Models\Tenant;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OwnerWebsiteTenantResolver
{
    public function resolveSlug(): string
    {
        return trim((string) config('owner_website.tenant_slug', 'besouhola'));
    }

    public function resolveTenant(): Tenant
    {
        $slug = $this->resolveSlug();

        $tenant = Tenant::query()
            ->where('slug', $slug)
            ->where('status', 'active')
            ->first();

        if (!$tenant) {
            throw new HttpException(404, "Owner website tenant [{$slug}] was not found.");
        }

        return $tenant;
    }

    public function resolveTenantId(): int
    {
        return (int) $this->resolveTenant()->id;
    }

    public function bindTenantContext(): int
    {
        $tenant = $this->resolveTenant();
        $tenantId = (int) $tenant->id;

        app()->instance('current_tenant_id', $tenantId);
        app()->instance('tenant', $tenant);

        return $tenantId;
    }
}
