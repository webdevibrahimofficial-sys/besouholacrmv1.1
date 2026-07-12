<?php

namespace App\Http\Controllers;

use App\Services\AdminEventNotificationService;
use App\Models\SubscriptionTransaction;
use App\Models\TenantSubscriptionContract;
use App\Models\Tenant;
use App\Services\SubscriptionTransactionService;
use App\Traits\LogsSuperAdminActivity;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SubscriptionTransactionController extends Controller
{
    use LogsSuperAdminActivity;

    public function __construct(
        private readonly SubscriptionTransactionService $transactionService,
        private readonly AdminEventNotificationService $adminEventNotifications
    )
    {
    }

    public function index(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        if (!$this->subscriptionTablesExist()) {
            return response()->json([
                'transactions' => [
                    'data' => [],
                    'current_page' => 1,
                    'last_page' => 1,
                    'per_page' => max(10, min((int) $request->integer('per_page', 20), 100)),
                    'total' => 0,
                    'from' => 0,
                    'to' => 0,
                ],
                'summary' => $this->emptySummary(),
                'meta' => $this->featureMeta(false),
            ]);
        }

        $perPage = max(10, min((int) $request->integer('per_page', 20), 100));
        $query = $this->buildFilteredQuery($request)
            ->with(['tenant', 'contract', 'creator'])
            ->withCount('items')
            ->orderByDesc('created_at');

        $transactions = $query->paginate($perPage)->through(fn (SubscriptionTransaction $transaction) => $this->serializeTransaction($transaction));

        return response()->json([
            'transactions' => $transactions,
            'summary' => $this->summaryPayload(clone $this->buildFilteredQuery($request)),
            'meta' => $this->featureMeta(true),
        ]);
    }

    public function summary(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        if (!$this->subscriptionTablesExist()) {
            return response()->json([
                ...$this->emptySummary(),
                'meta' => $this->featureMeta(false),
            ]);
        }

        return response()->json([
            ...$this->summaryPayload($this->buildFilteredQuery($request)),
            'meta' => $this->featureMeta(true),
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizeSuperAdmin($request);
        $this->ensureSubscriptionTablesExist();

        $validated = $this->validatePayload($request);
        $tenant = Tenant::query()->findOrFail($validated['tenant_id']);

        if (!empty($validated['contract_id']) && !$tenant->subscriptionContracts()->whereKey($validated['contract_id'])->exists()) {
            return response()->json([
                'message' => 'Selected contract does not belong to the tenant.',
            ], 422);
        }

        $transaction = $this->transactionService->record($tenant, $validated, $request->user(), 'manual');
        $this->notifyIfPaymentFailed($transaction);

        $this->logSuperAdminActivity(
            $request->user(),
            'created',
            'subscription_transaction_created',
            $transaction,
            [
                'transaction' => $this->serializeTransaction($transaction, true),
            ]
        );

        return response()->json([
            'message' => 'Subscription transaction recorded successfully.',
            'transaction' => $this->serializeTransaction($transaction, true),
        ], 201);
    }

    public function show(Request $request, int $id)
    {
        $this->authorizeSuperAdmin($request);
        $this->ensureSubscriptionTablesExist();

        $transaction = SubscriptionTransaction::query()
            ->with(['tenant', 'contract', 'creator', 'items'])
            ->findOrFail($id);

        return response()->json([
            'transaction' => $this->serializeTransaction($transaction, true),
        ]);
    }

    public function update(Request $request, int $id)
    {
        $this->authorizeSuperAdmin($request);
        $this->ensureSubscriptionTablesExist();

        $transaction = SubscriptionTransaction::query()->with(['items', 'contract'])->findOrFail($id);
        $before = $this->serializeTransaction($transaction->load(['tenant', 'creator']), true);
        $validated = $this->validatePayload($request, true);

        if (!empty($validated['tenant_id']) && (int) $validated['tenant_id'] !== (int) $transaction->tenant_id) {
            return response()->json([
                'message' => 'Tenant cannot be changed for an existing transaction.',
            ], 422);
        }

        if (!empty($validated['contract_id']) && !$transaction->tenant()->first()?->subscriptionContracts()->whereKey($validated['contract_id'])->exists()) {
            return response()->json([
                'message' => 'Selected contract does not belong to the tenant.',
            ], 422);
        }

        $updated = $this->transactionService->update($transaction, $validated);
        $this->notifyIfPaymentFailed($updated);

        $this->logSuperAdminActivity(
            $request->user(),
            'updated',
            'subscription_transaction_updated',
            $updated,
            [
                'old' => $before,
                'attributes' => $this->serializeTransaction($updated, true),
            ]
        );

        return response()->json([
            'message' => 'Subscription transaction updated successfully.',
            'transaction' => $this->serializeTransaction($updated, true),
        ]);
    }

    public function void(Request $request, int $id)
    {
        $this->authorizeSuperAdmin($request);
        $this->ensureSubscriptionTablesExist();

        $validated = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        $transaction = SubscriptionTransaction::query()->with(['tenant', 'contract', 'creator', 'items'])->findOrFail($id);
        $before = $this->serializeTransaction($transaction, true);
        $transaction->markVoid($validated['reason'] ?? null);
        $transaction->refresh()->load(['tenant', 'contract', 'creator', 'items']);

        $this->logSuperAdminActivity(
            $request->user(),
            'updated',
            'subscription_transaction_voided',
            $transaction,
            [
                'old' => $before,
                'attributes' => $this->serializeTransaction($transaction, true),
                'reason' => $validated['reason'] ?? null,
            ]
        );

        return response()->json([
            'message' => 'Subscription transaction voided successfully.',
            'transaction' => $this->serializeTransaction($transaction, true),
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $this->authorizeSuperAdmin($request);
        $this->ensureSubscriptionTablesExist();

        $query = $this->buildFilteredQuery($request)
            ->with(['tenant', 'contract', 'creator'])
            ->orderByDesc('created_at');

        $response = new StreamedResponse(function () use ($query) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, [
                'ID',
                'Tenant',
                'Plan Code',
                'Type',
                'Status',
                'Currency',
                'Total Amount',
                'Payment Method',
                'Source',
                'Gateway Reference',
                'Period Start',
                'Period End',
                'Created By',
                'Created At',
            ]);

            $query->chunk(500, function ($transactions) use ($handle) {
                foreach ($transactions as $transaction) {
                    fputcsv($handle, [
                        $transaction->id,
                        $transaction->tenant?->name,
                        $transaction->contract?->plan_code,
                        $transaction->type,
                        $transaction->status,
                        $transaction->currency,
                        $transaction->total_amount,
                        $transaction->payment_method,
                        $transaction->source,
                        $transaction->gateway_reference,
                        optional($transaction->period_start)->toDateString(),
                        optional($transaction->period_end)->toDateString(),
                        $transaction->creator?->name,
                        optional($transaction->created_at)->toDateTimeString(),
                    ]);
                }
            });

            fclose($handle);
        });

        $response->headers->set('Content-Type', 'text/csv');
        $response->headers->set('Content-Disposition', 'attachment; filename="subscription_transactions.csv"');

        return $response;
    }

    private function buildFilteredQuery(Request $request)
    {
        $search = trim((string) $request->input('search', ''));

        return SubscriptionTransaction::query()
            ->when($request->filled('tenant_id'), fn ($query) => $query->where('tenant_id', $request->integer('tenant_id')))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->input('status')))
            ->when($request->filled('type'), fn ($query) => $query->where('type', $request->input('type')))
            ->when($request->filled('currency'), fn ($query) => $query->where('currency', strtoupper((string) $request->input('currency'))))
            ->when($request->filled('source'), fn ($query) => $query->where('source', $request->input('source')))
            ->when($request->filled('date_from'), fn ($query) => $query->whereDate('created_at', '>=', $request->input('date_from')))
            ->when($request->filled('date_to'), fn ($query) => $query->whereDate('created_at', '<=', $request->input('date_to')))
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($inner) use ($search) {
                    $inner->where('notes', 'like', "%{$search}%")
                        ->orWhere('gateway_reference', 'like', "%{$search}%")
                        ->orWhere('payment_method', 'like', "%{$search}%")
                        ->orWhereHas('tenant', function ($tenantQuery) use ($search) {
                            $tenantQuery->where('name', 'like', "%{$search}%")
                                ->orWhere('domain', 'like', "%{$search}%")
                                ->orWhere('slug', 'like', "%{$search}%");
                        });
                });
            });
    }

    private function summaryPayload($query): array
    {
        $baseQuery = clone $query;
        $activeQuery = clone $query;
        $last24Query = clone $query;
        $pendingQuery = clone $query;

        $totalsByCurrency = $activeQuery
            ->where('status', '!=', 'void')
            ->select('currency', DB::raw('COUNT(*) as count'), DB::raw('SUM(total_amount) as total_amount'))
            ->groupBy('currency')
            ->orderBy('currency')
            ->get()
            ->map(fn ($row) => [
                'currency' => $row->currency,
                'count' => (int) $row->count,
                'total_amount' => (float) $row->total_amount,
            ])
            ->values()
            ->all();

        return [
            'totals_by_currency' => $totalsByCurrency,
            'pending_count' => $pendingQuery->where('status', 'pending')->count(),
            'last_24h_count' => $last24Query->where('created_at', '>=', now()->subDay())->count(),
            'total_results' => $baseQuery->count(),
        ];
    }

    private function emptySummary(): array
    {
        return [
            'totals_by_currency' => [],
            'pending_count' => 0,
            'last_24h_count' => 0,
            'total_results' => 0,
        ];
    }

    private function validatePayload(Request $request, bool $partial = false): array
    {
        $rules = [
            'tenant_id' => [$partial ? 'sometimes' : 'required', 'integer', 'exists:tenants,id'],
            'contract_id' => 'nullable|integer|exists:' . (new TenantSubscriptionContract())->getTable() . ',id',
            'type' => [$partial ? 'sometimes' : 'required', 'string', 'max:50'],
            'status' => 'nullable|string|max:50',
            'currency' => [$partial ? 'sometimes' : 'required', 'string', 'size:3'],
            'total_amount' => [$partial ? 'sometimes' : 'required', 'numeric'],
            'payment_method' => 'nullable|string|max:50',
            'gateway_provider' => 'nullable|string|max:100',
            'gateway_reference' => 'nullable|string|max:255',
            'period_start' => 'nullable|date',
            'period_end' => 'nullable|date|after_or_equal:period_start',
            'notes' => 'nullable|string|max:5000',
            'attachment_path' => 'nullable|string|max:2048',
            'plan_code' => 'nullable|string|max:100',
            'plan_label' => 'nullable|string|max:255',
            'items' => 'nullable|array|min:1',
            'items.*.item_type' => 'required_with:items|string|max:50',
            'items.*.item_code' => 'nullable|string|max:100',
            'items.*.label' => 'required_with:items|string|max:255',
            'items.*.quantity' => 'nullable|integer|min:1',
            'items.*.unit_price' => 'required_with:items|numeric',
            'items.*.amount' => 'required_with:items|numeric',
        ];

        $validated = $request->validate($rules);

        if (array_key_exists('currency', $validated)) {
            $validated['currency'] = strtoupper((string) $validated['currency']);
        }

        if (array_key_exists('items', $validated)) {
            $validated['items'] = collect($validated['items'] ?? [])
                ->map(function ($item) {
                    return [
                        'item_type' => $item['item_type'],
                        'item_code' => $item['item_code'] ?? null,
                        'label' => $item['label'],
                        'quantity' => (int) ($item['quantity'] ?? 1),
                        'unit_price' => $item['unit_price'],
                        'amount' => $item['amount'],
                    ];
                })
                ->values()
                ->all();
        }

        $hasItems = array_key_exists('items', $validated) && is_array($validated['items']) && $validated['items'] !== [];
        $hasTotal = array_key_exists('total_amount', $validated);

        if ($hasItems && $hasTotal) {
            $itemsTotal = round((float) collect($validated['items'])->sum(fn ($item) => (float) $item['amount']), 2);
            $totalAmount = round((float) $validated['total_amount'], 2);

            if (abs($itemsTotal - $totalAmount) > 0.01) {
                throw ValidationException::withMessages([
                    'items' => ['Items total must match transaction total amount.'],
                ]);
            }
        }

        return $validated;
    }

    private function serializeTransaction(SubscriptionTransaction $transaction, bool $withItems = false): array
    {
        return [
            'id' => $transaction->id,
            'tenant_id' => $transaction->tenant_id,
            'tenant_name' => $transaction->tenant?->name,
            'contract_id' => $transaction->contract_id,
            'plan_code' => $transaction->contract?->plan_code,
            'type' => $transaction->type,
            'status' => $transaction->status,
            'currency' => $transaction->currency,
            'total_amount' => (float) $transaction->total_amount,
            'payment_method' => $transaction->payment_method,
            'source' => $transaction->source,
            'gateway_provider' => $transaction->gateway_provider,
            'gateway_reference' => $transaction->gateway_reference,
            'period_start' => optional($transaction->period_start)->toDateString(),
            'period_end' => optional($transaction->period_end)->toDateString(),
            'notes' => $transaction->notes,
            'attachment_path' => $transaction->attachment_path,
            'created_by' => $transaction->created_by,
            'created_by_name' => $transaction->creator?->name,
            'items_count' => $transaction->items_count ?? $transaction->items?->count() ?? 0,
            'created_at' => optional($transaction->created_at)->toISOString(),
            'updated_at' => optional($transaction->updated_at)->toISOString(),
            'items' => $withItems
                ? $transaction->items->map(fn ($item) => [
                    'id' => $item->id,
                    'item_type' => $item->item_type,
                    'item_code' => $item->item_code,
                    'label' => $item->label,
                    'quantity' => (int) $item->quantity,
                    'unit_price' => (float) $item->unit_price,
                    'amount' => (float) $item->amount,
                ])->values()->all()
                : null,
        ];
    }

    private function authorizeSuperAdmin(Request $request): void
    {
        if (!$request->user() || !$request->user()->is_super_admin) {
            abort(403, 'Super Admin access required.');
        }
    }

    private function subscriptionTablesExist(): bool
    {
        return Schema::connection('landlord')->hasTable('tenant_subscription_contracts')
            && Schema::connection('landlord')->hasTable('subscription_transactions')
            && Schema::connection('landlord')->hasTable('subscription_transaction_items');
    }

    private function ensureSubscriptionTablesExist(): void
    {
        if (!$this->subscriptionTablesExist()) {
            throw new HttpResponseException(
                response()->json([
                    'message' => 'Subscription transaction tables are not ready yet. Please run the main database migrations first.',
                    'meta' => $this->featureMeta(false),
                ], 503)
            );
        }
    }

    private function featureMeta(bool $ready): array
    {
        return [
            'ready' => $ready,
            'code' => 'subscription_transaction_tables',
            'message' => $ready
                ? null
                : 'Subscription transaction tables are not ready yet. Please run the main database migrations first.',
            'migration_hint' => $ready
                ? null
                : 'Run the main application migrations that create tenant_subscription_contracts, subscription_transactions, and subscription_transaction_items.',
        ];
    }

    private function notifyIfPaymentFailed(SubscriptionTransaction $transaction): void
    {
        if (strtolower((string) $transaction->status) !== 'failed') {
            return;
        }

        $transaction->loadMissing('tenant');
        $this->adminEventNotifications->safe(fn () => $this->adminEventNotifications->notifyPaymentFailed($transaction));
    }
}
