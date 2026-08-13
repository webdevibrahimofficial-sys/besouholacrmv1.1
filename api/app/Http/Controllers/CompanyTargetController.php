<?php

namespace App\Http\Controllers;

use App\Models\CompanyYearlyTarget;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Request;

class CompanyTargetController extends Controller
{
    protected function canManageTargets(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if ((bool) ($user->is_super_admin ?? false) || (bool) ($user->is_primary_admin ?? false) || (bool) ($user->is_tenant_admin ?? false)) {
            return true;
        }

        $roleValues = collect([
            $user->role ?? null,
            $user->job_title ?? null,
        ]);

        if ($user->relationLoaded('roles')) {
            $roleValues = $roleValues->merge($user->roles->pluck('name'));
        } else {
            try {
                $roleValues = $roleValues->merge($user->roles()->pluck('name'));
            } catch (\Throwable $e) {
            }
        }

        return $roleValues
            ->filter()
            ->map(fn ($role) => strtolower(trim(str_replace(['_', '-'], ' ', (string) $role))))
            ->contains(fn ($role) => in_array($role, ['admin', 'tenant admin', 'super admin', 'administrator'], true) || str_contains($role, 'admin'));
    }

    protected function tenantIdFromRequest(Request $request): ?int
    {
        if (app()->bound('current_tenant_id')) {
            return (int) app('current_tenant_id');
        }

        if (app()->bound('tenant')) {
            return (int) app('tenant')->id;
        }

        return $request->user()?->tenant_id ? (int) $request->user()->tenant_id : null;
    }

    public function index(Request $request)
    {
        $tenantId = $this->tenantIdFromRequest($request);
        $validated = $request->validate([
            'year' => 'nullable',
        ]);

        $query = CompanyYearlyTarget::query();

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        if (($validated['year'] ?? null) && $validated['year'] !== 'all') {
            $query->where('year', (int) $validated['year']);
        }

        $targets = $query
            ->orderByDesc('year')
            ->get();

        $tenant = $tenantId ? Tenant::find($tenantId) : null;
        $createdYear = $tenant?->created_at ? (int) $tenant->created_at->format('Y') : (int) now()->year;
        $currentYear = (int) now()->year;
        $currentTarget = $targets->firstWhere('year', $currentYear);

        return response()->json([
            'data' => $targets,
            'current_target' => $currentTarget,
            'years' => range($currentYear, $createdYear),
            'current_year' => $currentYear,
            'tenant_created_year' => $createdYear,
        ]);
    }

    public function store(Request $request)
    {
        if (!$this->canManageTargets($request->user())) {
            return response()->json([
                'message' => 'Only admins can add or update company targets.',
            ], 403);
        }

        $tenantId = $this->tenantIdFromRequest($request);

        $validated = $request->validate([
            'year' => 'required|integer|min:2000|max:2100',
            'yearly_target' => 'nullable|numeric|min:0',
        ]);

        $yearlyTarget = round((float) ($validated['yearly_target'] ?? 0), 2);
        $year = (int) $validated['year'];
        $actorId = $request->user()?->id;

        $target = CompanyYearlyTarget::query()->firstOrNew([
            'tenant_id' => $tenantId,
            'year' => $year,
        ]);

        if (!$target->exists) {
            $target->created_by_id = $actorId;
        }

        $target->fill([
            'yearly_target' => $yearlyTarget,
            'monthly_target' => round($yearlyTarget / 12, 2),
            'quarterly_target' => round($yearlyTarget / 4, 2),
            'semi_annual_target' => round($yearlyTarget / 2, 2),
            'updated_by_id' => $actorId,
        ]);
        $target->save();

        return response()->json(['data' => $target]);
    }

    public function destroy(Request $request, CompanyYearlyTarget $companyTarget)
    {
        if (!$this->canManageTargets($request->user())) {
            return response()->json([
                'message' => 'Only admins can delete company targets.',
            ], 403);
        }

        $tenantId = $this->tenantIdFromRequest($request);

        if ($tenantId && (int) $companyTarget->tenant_id !== $tenantId) {
            abort(404);
        }

        $companyTarget->delete();

        return response()->json(['message' => 'Company target deleted successfully.']);
    }
}
