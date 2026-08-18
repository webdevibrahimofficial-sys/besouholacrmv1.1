<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Models\User;
use App\Models\UserCommissionTier;
use App\Models\UserYearlyTarget;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class UserTargetController extends Controller
{
    protected function canManageTargets(?User $user): bool
    {
        if (!$user) {
            return false;
        }

        if ((bool) ($user->is_super_admin ?? false)) {
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
            ->contains(fn ($role) => in_array($role, ['admin', 'tenant admin', 'super admin'], true));
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
            'user_id' => ['nullable', 'integer', Rule::exists('users', 'id')->where(fn ($query) => $tenantId ? $query->where('tenant_id', $tenantId) : $query)],
            'year' => 'nullable',
        ]);

        $targetQuery = UserYearlyTarget::query()
            ->with(['user:id,name,email,tenant_id,manager_id,job_title', 'user.manager:id,name']);

        if ($tenantId) {
            $targetQuery->where('tenant_id', $tenantId);
        }

        if (!empty($validated['user_id'])) {
            $targetQuery->where('user_id', (int) $validated['user_id']);
        }

        if (($validated['year'] ?? null) && $validated['year'] !== 'all') {
            $targetQuery->where('year', (int) $validated['year']);
        }

        $targets = $targetQuery
            ->orderByDesc('year')
            ->orderBy('user_id')
            ->get();

        $tiers = UserCommissionTier::query()
            ->when($tenantId, fn ($query) => $query->where('tenant_id', $tenantId))
            ->when(!empty($validated['user_id']), fn ($query) => $query->where('user_id', (int) $validated['user_id']))
            ->when(($validated['year'] ?? null) && $validated['year'] !== 'all', fn ($query) => $query->where('year', (int) $validated['year']))
            ->orderBy('from_percentage')
            ->get()
            ->groupBy(fn ($tier) => $tier->user_id . ':' . $tier->year);

        $targets->each(function ($target) use ($tiers) {
            $this->decorateTargetTiers(
                $target,
                $tiers->get($target->user_id . ':' . $target->year, collect())->values()
            );
        });

        $tenant = $tenantId ? Tenant::find($tenantId) : null;
        $createdYear = $tenant?->created_at ? (int) $tenant->created_at->format('Y') : (int) now()->year;
        $currentYear = (int) now()->year;

        return response()->json([
            'data' => $targets,
            'years' => range($currentYear, $createdYear),
            'current_year' => $currentYear,
            'tenant_created_year' => $createdYear,
        ]);
    }

    public function store(Request $request)
    {
        if (!$this->canManageTargets($request->user())) {
            return response()->json([
                'message' => 'Only admins can add or update user targets.',
            ], 403);
        }

        $tenantId = $this->tenantIdFromRequest($request);

        $validated = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where(fn ($query) => $tenantId ? $query->where('tenant_id', $tenantId) : $query)],
            'year' => 'required|integer|min:2000|max:2100',
            'yearly_target' => 'nullable|numeric|min:0',
            'commission_tiers' => 'nullable|array',
            'commission_tiers.*.from_percentage' => 'required_with:commission_tiers|numeric|min:0|max:1000',
            'commission_tiers.*.to_percentage' => 'nullable|numeric|min:0|max:1000',
            'commission_tiers.*.commission_percentage' => 'required_with:commission_tiers|numeric|min:0|max:100',
            'commission_tiers.*.scope' => 'nullable|in:personal,inherited',
            'inherited_commission_tiers' => 'nullable|array',
            'inherited_commission_tiers.*.from_percentage' => 'required_with:inherited_commission_tiers|numeric|min:0|max:1000',
            'inherited_commission_tiers.*.to_percentage' => 'nullable|numeric|min:0|max:1000',
            'inherited_commission_tiers.*.commission_percentage' => 'required_with:inherited_commission_tiers|numeric|min:0|max:100',
        ]);

        $hasYearlyTarget = array_key_exists('yearly_target', $validated);
        $year = (int) $validated['year'];
        $userId = (int) $validated['user_id'];
        $actorId = $request->user()?->id;

        $target = DB::transaction(function () use ($tenantId, $userId, $year, $hasYearlyTarget, $validated, $actorId) {
            $target = UserYearlyTarget::query()->firstOrNew([
                'tenant_id' => $tenantId,
                'user_id' => $userId,
                'year' => $year,
            ]);

            if (!$target->exists) {
                $target->created_by_id = $actorId;
            }

            $yearlyTarget = $hasYearlyTarget
                ? round((float) ($validated['yearly_target'] ?? 0), 2)
                : round((float) ($target->yearly_target ?? 0), 2);

            if ($hasYearlyTarget || !$target->exists) {
                $target->fill([
                    'yearly_target' => $yearlyTarget,
                    'monthly_target' => round($yearlyTarget / 12, 2),
                    'quarterly_target' => round($yearlyTarget / 4, 2),
                    'semi_annual_target' => round($yearlyTarget / 2, 2),
                ]);
            }

            $target->updated_by_id = $actorId;
            $target->save();

            $shouldSyncPersonalTiers = array_key_exists('commission_tiers', $validated);
            $shouldSyncInheritedTiers = array_key_exists('inherited_commission_tiers', $validated);
            $personalTiers = collect();

            if ($shouldSyncPersonalTiers || $shouldSyncInheritedTiers) {
                $incomingTiers = $this->normalizeIncomingTiers($validated['commission_tiers'] ?? []);
                $explicitInherited = $this->normalizeIncomingTiers(
                    $validated['inherited_commission_tiers'] ?? [],
                    UserCommissionTier::SCOPE_INHERITED
                );

                $personalTiers = $incomingTiers
                    ->filter(fn ($tier) => $tier['scope'] === UserCommissionTier::SCOPE_PERSONAL)
                    ->values();
                $inheritedFromMixed = $incomingTiers
                    ->filter(fn ($tier) => $tier['scope'] === UserCommissionTier::SCOPE_INHERITED)
                    ->values();

                if ($shouldSyncPersonalTiers) {
                    $this->syncTiersForScope($tenantId, $userId, $year, UserCommissionTier::SCOPE_PERSONAL, $personalTiers);
                }

                if ($shouldSyncInheritedTiers) {
                    $this->syncTiersForScope($tenantId, $userId, $year, UserCommissionTier::SCOPE_INHERITED, $explicitInherited);
                } elseif ($shouldSyncPersonalTiers && $inheritedFromMixed->isNotEmpty()) {
                    $this->syncTiersForScope($tenantId, $userId, $year, UserCommissionTier::SCOPE_INHERITED, $inheritedFromMixed);
                }
            }

            if ($year === (int) now()->year) {
                $currentYearUserUpdates = [];

                if ($hasYearlyTarget) {
                    $currentYearUserUpdates['yearly_target'] = $yearlyTarget;
                    $currentYearUserUpdates['quarterly_target'] = round($yearlyTarget / 4, 2);
                    $currentYearUserUpdates['monthly_target'] = round($yearlyTarget / 12, 2);
                }

                if ($shouldSyncPersonalTiers) {
                    $fallbackCommission = (float) ($personalTiers->first()['commission_percentage'] ?? 0);
                    $currentYearUserUpdates['commission_percentage'] = $fallbackCommission ?: null;
                }

                if (!empty($currentYearUserUpdates)) {
                    User::query()->whereKey($userId)->update($currentYearUserUpdates);
                }
            }

            $target = $target->fresh(['user:id,name,email,tenant_id,manager_id,job_title', 'user.manager:id,name']);
            $this->decorateTargetTiers(
                $target,
                UserCommissionTier::query()
                    ->where('tenant_id', $tenantId)
                    ->where('user_id', $userId)
                    ->where('year', $year)
                    ->orderBy('scope')
                    ->orderBy('from_percentage')
                    ->get()
            );

            return $target;
        });

        return response()->json(['data' => $target]);
    }

    protected function decorateTargetTiers(UserYearlyTarget $target, $tiers): void
    {
        $collection = collect($tiers)->values();
        $inherited = $collection
            ->filter(fn ($tier) => UserCommissionTier::normalizeScope($tier->scope ?? null) === UserCommissionTier::SCOPE_INHERITED)
            ->values();

        $target->setRelation('commissionTiers', $collection);
        $target->setAttribute('inherited_commission_tiers', $inherited);
    }

    protected function normalizeIncomingTiers(array $tiers, ?string $forcedScope = null)
    {
        return collect($tiers)
            ->map(function ($tier) use ($forcedScope) {
                return [
                    'from_percentage' => round((float) ($tier['from_percentage'] ?? 0), 2),
                    'to_percentage' => isset($tier['to_percentage']) && $tier['to_percentage'] !== ''
                        ? round((float) $tier['to_percentage'], 2)
                        : null,
                    'commission_percentage' => round((float) ($tier['commission_percentage'] ?? 0), 2),
                    'scope' => $forcedScope ?: UserCommissionTier::normalizeScope($tier['scope'] ?? null),
                ];
            })
            ->filter(fn ($tier) => $tier['commission_percentage'] > 0 || $tier['from_percentage'] > 0 || $tier['to_percentage'] !== null)
            ->sortBy('from_percentage')
            ->values();
    }

    protected function syncTiersForScope(?int $tenantId, int $userId, int $year, string $scope, $tiers): void
    {
        UserCommissionTier::query()
            ->where('tenant_id', $tenantId)
            ->where('user_id', $userId)
            ->where('year', $year)
            ->where('scope', $scope)
            ->delete();

        foreach (collect($tiers) as $tier) {
            UserCommissionTier::query()->create([
                'tenant_id' => $tenantId,
                'user_id' => $userId,
                'year' => $year,
                'scope' => $scope,
                'from_percentage' => $tier['from_percentage'],
                'to_percentage' => $tier['to_percentage'],
                'commission_percentage' => $tier['commission_percentage'],
            ]);
        }
    }
}
