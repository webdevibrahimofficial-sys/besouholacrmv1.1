<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\FinancialDecision\FinancialConfigurationStore;
use App\Services\FinancialDecision\FinancialDecisionService;
use App\Services\FinancialDecision\FinancialRequestParser;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FinancialDecisionController extends Controller
{
    public function __construct(
        private readonly FinancialDecisionService $decisions,
        private readonly FinancialConfigurationStore $config,
        private readonly FinancialRequestParser $parser,
    ) {
    }

    public function evaluate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message' => 'nullable|string|max:4000',
            'locale' => 'nullable|string|in:ar,en,ar-EG,en-US',
            'intent' => 'nullable|string',
            'lead_id' => 'nullable|integer',
            'unit_id' => 'nullable|integer',
            'quote_id' => 'nullable|integer',
            'discount_percentage' => 'nullable|numeric',
            'discount_amount' => 'nullable|numeric',
            'down_payment_percentage' => 'nullable|numeric',
            'down_payment_amount' => 'nullable|numeric',
            'duration_months' => 'nullable|integer',
            'duration_years' => 'nullable|integer',
            'gross_amount' => 'nullable|numeric',
            'frequency' => 'nullable|string',
            'mode' => 'nullable|string',
        ]);

        $locale = $this->locale($validated['locale'] ?? null, $validated['message'] ?? '');
        $structured = $this->parser->fromArray($validated);
        if (! empty($validated['message']) && $this->isSparse($validated)) {
            $fromMessage = $this->parser->parse((string) $validated['message'], $locale);
            $structured = $this->parser->fromArray(array_merge($fromMessage->toArray(), array_filter($validated, fn ($value) => $value !== null && $value !== '')));
        }

        $payload = $this->decisions->evaluate($request->user(), $structured, $locale);

        return response()->json(['data' => $payload]);
    }

    public function showSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canManage($user)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $tenantId = $this->tenantId($request);
        if (! $tenantId) {
            return response()->json(['message' => 'No tenant context.'], 403);
        }

        return response()->json(['data' => $this->config->settingsPayload($tenantId)]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $this->canManage($user)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $tenantId = $this->tenantId($request);
        if (! $tenantId) {
            return response()->json(['message' => 'No tenant context.'], 403);
        }

        $validated = $request->validate([
            'discount_rate' => 'required|numeric|min:0|max:1',
            'day_count_convention' => 'nullable|string|in:actual_365',
            'compounding_frequency' => 'nullable|string|in:annual',
            'rounding_rule' => 'nullable|string',
            'minimum_npv_ratio' => 'required|numeric|min:0|max:2',
            'minimum_initial_collection_percentage' => 'required|numeric|min:0|max:100',
            'maximum_discount_percentage' => 'required|numeric|min:0|max:100',
            'manager_maximum_discount_percentage' => 'required|numeric|min:0|max:100',
            'maximum_duration_months' => 'required|integer|min:1|max:600',
        ]);

        return response()->json(['data' => $this->config->save($tenantId, $validated, $user)]);
    }

    private function canManage(?User $user): bool
    {
        if (! $user) {
            return false;
        }

        if ((bool) ($user->is_super_admin ?? false) || (bool) ($user->is_primary_admin ?? false) || (bool) ($user->is_tenant_admin ?? false)) {
            return true;
        }

        $roleValues = collect([
            $user->role ?? null,
            $user->job_title ?? null,
        ]);

        try {
            $roleValues = $roleValues->merge($user->roles()->pluck('name'));
        } catch (\Throwable) {
        }

        return $roleValues
            ->filter()
            ->map(fn ($role) => strtolower(trim(str_replace(['_', '-'], ' ', (string) $role))))
            ->contains(fn ($role) => in_array($role, ['admin', 'tenant admin', 'super admin', 'administrator'], true) || str_contains($role, 'admin'));
    }

    private function tenantId(Request $request): ?int
    {
        if (app()->bound('current_tenant_id')) {
            return (int) app('current_tenant_id');
        }

        return $request->user()?->tenant_id ? (int) $request->user()->tenant_id : null;
    }

    private function locale(?string $preferred, string $message): string
    {
        if (preg_match('/\p{Arabic}/u', $message)) {
            return 'ar';
        }

        $normalized = strtolower((string) $preferred);

        return str_starts_with($normalized, 'ar') ? 'ar' : 'en';
    }

    private function isSparse(array $validated): bool
    {
        foreach (['lead_id', 'gross_amount', 'discount_percentage', 'down_payment_percentage', 'duration_months'] as $key) {
            if (! empty($validated[$key])) {
                return false;
            }
        }

        return true;
    }
}
