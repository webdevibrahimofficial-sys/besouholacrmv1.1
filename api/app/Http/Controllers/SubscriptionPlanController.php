<?php

namespace App\Http\Controllers;

use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Schema;

class SubscriptionPlanController extends Controller
{
    protected function subscriptionPlansHasIconColumn(): bool
    {
        return Schema::connection('landlord')->hasColumn((new SubscriptionPlan())->getTable(), 'icon');
    }

    public function index(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $query = SubscriptionPlan::query()->orderBy('display_order')->orderBy('name');

        if (!$request->boolean('include_inactive')) {
            $query->where('is_active', true);
        }

        $plans = $query->get();
        $tenantCounts = Tenant::query()
            ->selectRaw('subscription_plan, COUNT(*) as aggregate')
            ->whereIn('subscription_plan', $plans->pluck('code')->filter()->values())
            ->groupBy('subscription_plan')
            ->pluck('aggregate', 'subscription_plan');

        $plans->each(function ($plan) use ($tenantCounts) {
            $plan->tenants_count = (int) ($tenantCounts[$plan->code] ?? 0);
        });

        return response()->json([
            'plans' => $plans,
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizeSuperAdmin($request);
        $hasIconColumn = $this->subscriptionPlansHasIconColumn();

        $table = (new SubscriptionPlan())->getConnectionName() . '.' . (new SubscriptionPlan())->getTable();

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:50', 'regex:/^[a-z0-9_-]+$/', Rule::unique($table, 'code')],
            'name' => 'required|string|max:255',
            'icon' => ['nullable', 'string', 'max:50', 'regex:/^[a-z0-9_-]+$/'],
            'description' => 'nullable|string',
            'modules' => 'nullable|array',
            'modules.*' => ['string', 'regex:/^[a-z0-9_-]+$/i'],
            'company_type_overrides' => 'nullable|array',
            'company_type_overrides.*' => 'array',
            'company_type_overrides.*.*' => ['string', 'regex:/^[a-z0-9_-]+$/i'],
            'is_active' => 'nullable|boolean',
            'display_order' => 'nullable|integer|min:0',
        ]);

        $payload = [
            'code' => strtolower($validated['code']),
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'modules' => array_values(array_unique($validated['modules'] ?? [])),
            'company_type_overrides' => $validated['company_type_overrides'] ?? [],
            'is_active' => $request->boolean('is_active', true),
            'display_order' => $validated['display_order'] ?? 0,
        ];

        if ($hasIconColumn) {
            $payload['icon'] = $validated['icon'] ?? null;
        }

        $plan = SubscriptionPlan::create($payload);

        return response()->json([
            'message' => 'Subscription plan created successfully.',
            'plan' => $plan,
        ], 201);
    }

    public function update(Request $request, SubscriptionPlan $subscriptionPlan)
    {
        $this->authorizeSuperAdmin($request);
        $hasIconColumn = $this->subscriptionPlansHasIconColumn();

        $table = $subscriptionPlan->getConnectionName() . '.' . $subscriptionPlan->getTable();

        $validated = $request->validate([
            'code' => [
                'required',
                'string',
                'max:50',
                'regex:/^[a-z0-9_-]+$/',
                Rule::unique($table, 'code')->ignore($subscriptionPlan->id),
            ],
            'name' => 'required|string|max:255',
            'icon' => ['nullable', 'string', 'max:50', 'regex:/^[a-z0-9_-]+$/'],
            'description' => 'nullable|string',
            'modules' => 'nullable|array',
            'modules.*' => ['string', 'regex:/^[a-z0-9_-]+$/i'],
            'company_type_overrides' => 'nullable|array',
            'company_type_overrides.*' => 'array',
            'company_type_overrides.*.*' => ['string', 'regex:/^[a-z0-9_-]+$/i'],
            'is_active' => 'nullable|boolean',
            'display_order' => 'nullable|integer|min:0',
        ]);

        $payload = [
            'code' => strtolower($validated['code']),
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'modules' => array_values(array_unique($validated['modules'] ?? [])),
            'company_type_overrides' => $validated['company_type_overrides'] ?? [],
            'is_active' => $request->boolean('is_active', true),
            'display_order' => $validated['display_order'] ?? $subscriptionPlan->display_order,
        ];

        if ($hasIconColumn) {
            $payload['icon'] = $validated['icon'] ?? null;
        }

        $subscriptionPlan->update($payload);

        return response()->json([
            'message' => 'Subscription plan updated successfully.',
            'plan' => $subscriptionPlan,
        ]);
    }

    public function destroy(Request $request, SubscriptionPlan $subscriptionPlan)
    {
        $this->authorizeSuperAdmin($request);

        $inUse = \App\Models\Tenant::where('subscription_plan', $subscriptionPlan->code)->exists();
        if ($inUse) {
            return response()->json([
                'message' => 'This plan is assigned to one or more tenants and cannot be deleted.',
            ], 422);
        }

        $subscriptionPlan->delete();

        return response()->json([
            'message' => 'Subscription plan deleted successfully.',
        ]);
    }

    protected function authorizeSuperAdmin(Request $request): void
    {
        if (!$request->user() || !$request->user()->is_super_admin) {
            abort(403, 'Super Admin access required.');
        }
    }
}
