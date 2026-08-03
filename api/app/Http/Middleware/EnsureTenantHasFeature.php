<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use App\Services\TenantFeatureService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTenantHasFeature
{
    public function __construct(
        private readonly TenantFeatureService $tenantFeatureService
    ) {
    }

    public function handle(Request $request, Closure $next, string $featureKey): Response
    {
        $tenant = app()->bound('tenant') ? app('tenant') : null;

        if (! $tenant instanceof Tenant) {
            return response()->json([
                'message' => 'No active tenant context found for this feature.',
                'feature' => $featureKey,
            ], 403);
        }

        if (! $this->tenantFeatureService->tenantHasFeature($tenant, $featureKey)) {
            return response()->json([
                'message' => 'This feature is not enabled for the current tenant.',
                'feature' => $featureKey,
            ], 403);
        }

        return $next($request);
    }
}
