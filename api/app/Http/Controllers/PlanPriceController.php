<?php

namespace App\Http\Controllers;

use App\Models\SubscriptionPlanPrice;
use App\Models\SubscriptionPlan;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class PlanPriceController extends Controller
{
    public function store(Request $request)
    {
        $this->authorizeSuperAdmin($request);
        $this->ensurePlanPricesTableExists();

        $plansTable = (new SubscriptionPlan())->getTable();

        $validated = $request->validate([
            'subscription_plan_id' => "required|integer|exists:{$plansTable},id",
            'currency' => 'required|string|size:3',
            'billing_cycle' => 'required|string|max:50',
            'list_price' => 'required|numeric',
            'is_active' => 'sometimes|boolean',
        ]);

        $validated['currency'] = strtoupper((string) $validated['currency']);
        $validated['is_active'] = (bool) ($validated['is_active'] ?? true);

        $price = SubscriptionPlanPrice::query()->create($validated)->load('subscriptionPlan');

        return response()->json([
            'message' => 'Plan reference price created successfully.',
            'price' => $this->serializePrice($price),
        ], 201);
    }

    public function index(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        if (!$this->planPricesTableExists()) {
            return response()->json([
                'prices' => [],
                'meta' => $this->featureMeta(false),
            ]);
        }

        $prices = SubscriptionPlanPrice::query()
            ->with('subscriptionPlan')
            ->orderBy('currency')
            ->orderBy('billing_cycle')
            ->get()
            ->map(fn ($price) => $this->serializePrice($price))
            ->values();

        return response()->json([
            'prices' => $prices,
            'meta' => $this->featureMeta(true),
        ]);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizeSuperAdmin($request);
        $this->ensurePlanPricesTableExists();

        $price = SubscriptionPlanPrice::query()->with('subscriptionPlan')->findOrFail($id);
        $validated = $request->validate([
            'currency' => 'sometimes|string|size:3',
            'billing_cycle' => 'sometimes|string|max:50',
            'list_price' => 'sometimes|numeric',
            'is_active' => 'sometimes|boolean',
        ]);

        if (array_key_exists('currency', $validated)) {
            $validated['currency'] = strtoupper((string) $validated['currency']);
        }

        $price->update($validated);

        return response()->json([
            'message' => 'Plan reference price updated successfully.',
            'price' => $this->serializePrice($price->fresh('subscriptionPlan')),
        ]);
    }

    private function serializePrice(SubscriptionPlanPrice $price): array
    {
        return [
            'id' => $price->id,
            'subscription_plan_id' => $price->subscription_plan_id,
            'plan_code' => $price->subscriptionPlan?->code,
            'plan_name' => $price->subscriptionPlan?->name,
            'currency' => $price->currency,
            'billing_cycle' => $price->billing_cycle,
            'list_price' => (float) $price->list_price,
            'is_active' => (bool) $price->is_active,
            'created_at' => optional($price->created_at)->toISOString(),
            'updated_at' => optional($price->updated_at)->toISOString(),
        ];
    }

    private function authorizeSuperAdmin(Request $request): void
    {
        if (!$request->user() || !$request->user()->is_super_admin) {
            abort(403, 'Super Admin access required.');
        }
    }

    private function planPricesTableExists(): bool
    {
        return Schema::hasTable((new SubscriptionPlanPrice())->getTable());
    }

    private function ensurePlanPricesTableExists(): void
    {
        if (!$this->planPricesTableExists()) {
            throw new HttpResponseException(
                response()->json([
                    'message' => 'Subscription pricing tables are not ready yet. Please run the main database migrations first.',
                    'meta' => $this->featureMeta(false),
                ], 503)
            );
        }
    }

    private function featureMeta(bool $ready): array
    {
        return [
            'ready' => $ready,
            'code' => 'subscription_pricing_tables',
            'message' => $ready
                ? null
                : 'Subscription pricing tables are not ready yet. Please run the main database migrations first.',
            'migration_hint' => $ready
                ? null
                : 'Run the main application migrations that create the subscription_plan_prices table.',
        ];
    }
}
