<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Services\TenantSubscriptionContractService;
use App\Traits\LogsSuperAdminActivity;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class TenantSubscriptionContractController extends Controller
{
    use LogsSuperAdminActivity;

    public function __construct(private readonly TenantSubscriptionContractService $contractService)
    {
    }

    public function index(Request $request, Tenant $tenant)
    {
        $this->authorizeSuperAdmin($request);

        if (!$this->contractsTableExists()) {
            return response()->json([
                'contracts' => [],
                'current_contract' => null,
                'meta' => $this->featureMeta(false),
            ]);
        }

        $contracts = $tenant->subscriptionContracts()
            ->with('creator')
            ->orderByDesc('effective_from')
            ->get()
            ->map(fn ($contract) => $this->serializeContract($contract))
            ->values();

        return response()->json([
            'contracts' => $contracts,
            'current_contract' => $contracts->firstWhere('effective_to', null),
            'meta' => $this->featureMeta(true),
        ]);
    }

    public function store(Request $request, Tenant $tenant)
    {
        $this->authorizeSuperAdmin($request);
        $this->ensureContractsTableExists();

        $validated = $request->validate([
            'plan_code' => 'required|string|max:100',
            'currency' => 'required|string|size:3',
            'billing_cycle' => 'required|string|max:50',
            'agreed_amount' => 'required|numeric',
            'effective_from' => 'required|date',
            'notes' => 'nullable|string|max:5000',
        ]);

        $validated['currency'] = strtoupper((string) $validated['currency']);

        $contract = $this->contractService->createContract($tenant, $validated, $request->user())->load('creator');

        $this->logSuperAdminActivity(
            $request->user(),
            'created',
            'tenant_subscription_contract_created',
            $contract,
            [
                'contract' => $this->serializeContract($contract),
                'tenant' => [
                    'id' => $tenant->id,
                    'name' => $tenant->name,
                ],
            ]
        );

        return response()->json([
            'message' => 'Contract created successfully.',
            'contract' => $this->serializeContract($contract),
        ], 201);
    }

    private function serializeContract($contract): array
    {
        return [
            'id' => $contract->id,
            'tenant_id' => $contract->tenant_id,
            'plan_code' => $contract->plan_code,
            'currency' => $contract->currency,
            'billing_cycle' => $contract->billing_cycle,
            'agreed_amount' => (float) $contract->agreed_amount,
            'effective_from' => optional($contract->effective_from)->toDateString(),
            'effective_to' => optional($contract->effective_to)->toDateString(),
            'notes' => $contract->notes,
            'created_by' => $contract->created_by,
            'created_by_name' => $contract->creator?->name,
            'created_at' => optional($contract->created_at)->toISOString(),
            'updated_at' => optional($contract->updated_at)->toISOString(),
        ];
    }

    private function authorizeSuperAdmin(Request $request): void
    {
        if (!$request->user() || !$request->user()->is_super_admin) {
            abort(403, 'Super Admin access required.');
        }
    }

    private function contractsTableExists(): bool
    {
        return Schema::connection('landlord')->hasTable('tenant_subscription_contracts');
    }

    private function ensureContractsTableExists(): void
    {
        if (!$this->contractsTableExists()) {
            throw new HttpResponseException(
                response()->json([
                    'message' => 'Subscription contract tables are not ready yet. Please run the main database migrations first.',
                    'meta' => $this->featureMeta(false),
                ], 503)
            );
        }
    }

    private function featureMeta(bool $ready): array
    {
        return [
            'ready' => $ready,
            'code' => 'tenant_subscription_contract_tables',
            'message' => $ready
                ? null
                : 'Subscription contract tables are not ready yet. Please run the main database migrations first.',
            'migration_hint' => $ready
                ? null
                : 'Run the main application migrations that create tenant_subscription_contracts and related billing tables.',
        ];
    }
}
