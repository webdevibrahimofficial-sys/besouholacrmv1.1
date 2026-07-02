<?php

namespace App\Http\Controllers;

use App\Models\Tenant;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Services\SubscriptionTransactionService;
use App\Services\TenantSubscriptionContractService;
use App\Services\TenantService;
use App\Services\TenantStatusService;
use App\Traits\LogsSuperAdminActivity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class SuperAdminController extends Controller
{
    use LogsSuperAdminActivity;

    protected TenantService $tenantService;
    protected TenantStatusService $tenantStatusService;
    protected TenantSubscriptionContractService $contractService;
    protected SubscriptionTransactionService $transactionService;

    public function __construct(
        TenantService $tenantService,
        TenantStatusService $tenantStatusService,
        TenantSubscriptionContractService $contractService,
        SubscriptionTransactionService $transactionService
    )
    {
        $this->tenantService = $tenantService;
        $this->tenantStatusService = $tenantStatusService;
        $this->contractService = $contractService;
        $this->transactionService = $transactionService;
    }

    protected function tenantAccessShouldBeBlocked(Tenant $tenant): bool
    {
        $status = strtolower((string) ($tenant->status ?? ''));
        return $this->tenantAccessBlockedState($status, $tenant->end_date);
    }

    protected function tenantAccessBlockedState(string $status, $endDate): bool
    {
        if (in_array($status, ['cancelled', 'suspended', 'expired'], true)) {
            return true;
        }

        try {
            return $endDate ? now()->greaterThan($endDate->copy()->endOfDay()) : false;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * List all tenants with their user counts.
     */
    public function tenants(Request $request)
    {
        $this->authorizeSuperAdmin($request);
        $this->tenantStatusService->syncExpiredTenants();

        $view = strtolower((string) $request->input('view', 'current'));
        $perPage = (int) $request->integer('per_page', 20);
        $perPage = max(10, min($perPage, 100));

        $query = Tenant::with(['modules'])
            ->with(['backups' => function ($q) {
                $q->latest()->limit(1);
            }])
            ->withCount(['users' => function ($q) {
                $q->withoutGlobalScopes();
            }]);

        if ($this->subscriptionContractsTableExists()) {
            $query->with(['subscriptionContracts' => function ($q) {
                $q->whereNull('effective_to')->latest('effective_from')->limit(1);
            }]);
        }

        if ($view === 'archived') {
            $query->whereNotNull('archived_at');
        } else {
            $query->whereNull('archived_at');
        }

        // Filter by Search (Name or Domain)
        if ($request->has('search') && $request->search) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('domain', 'like', "%{$search}%")
                  ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        // Filter by Plan Type
        if ($request->has('plan') && $request->plan && $request->plan !== 'all') {
            $query->where('subscription_plan', $request->plan);
        }

        // Filter by Status
        if ($request->has('status') && $request->status && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        // Filter by Company Type
        if ($request->has('company_type') && $request->company_type && $request->company_type !== 'all') {
            $query->where('company_type', $request->company_type);
        }

        // Filter by Country
        if ($request->has('country') && $request->country && $request->country !== 'all') {
            $query->where('country', $request->country);
        }

        $tenants = $query->latest()->paginate($perPage);

        $mapped = $tenants->through(function (Tenant $tenant) {
            $last  = $tenant->backups->first();
            $owner = User::withoutGlobalScopes()
                ->where('tenant_id', $tenant->id)
                ->orderBy('id')
                ->first();
            $currentContract = $this->subscriptionContractsTableExists()
                ? $tenant->subscriptionContracts->first()
                : null;

            $data = $tenant->toArray();
            $data['users_count']       = $tenant->users_count ?? 0;
            $data['last_backup_status'] = $last?->status;
            $data['last_backup_at']    = $last?->finished_at;
            $data['admin_name']        = $owner?->name;
            $data['admin_email']       = $owner?->email;
            $data['current_contract']  = $currentContract ? [
                'id' => $currentContract->id,
                'plan_code' => $currentContract->plan_code,
                'currency' => $currentContract->currency,
                'billing_cycle' => $currentContract->billing_cycle,
                'agreed_amount' => (float) $currentContract->agreed_amount,
                'effective_from' => optional($currentContract->effective_from)->toDateString(),
                'effective_to' => optional($currentContract->effective_to)->toDateString(),
                'notes' => $currentContract->notes,
            ] : null;

            return $data;
        });

        return response()->json([
            'tenants' => $mapped,
            'counts' => [
                'current' => Tenant::whereNull('archived_at')->count(),
                'archived' => Tenant::whereNotNull('archived_at')->count(),
            ],
            'view' => $view,
        ]);
    }

    /**
     * Provision a new tenant via Artisan command + update subscription metadata.
     */
    public function storeTenant(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'domain' => 'required|string|max:255|unique:tenants,domain',
            'slug' => 'required|string|max:64|unique:tenants,slug|regex:/^[a-z0-9\-]+$/',
            'tenancy_type' => 'required|string|in:shared,dedicated',
            'admin_name' => 'required|string|max:255',
            'admin_email' => 'required|email|max:255',
            'admin_password' => 'required|string|min:8',
            'plan' => 'nullable|string|max:50',
            'modules' => 'nullable|array',
            // Do not require modules to already exist in DB; TenantService will create/sanitize module slugs.
            'modules.*' => ['string', 'regex:/^[a-z0-9_-]+$/i'],
            'company_type' => 'nullable|string|in:General,Real Estate',
            'users_limit' => 'required|integer|min:1',
            'start_date' => 'required|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'is_lifetime' => 'nullable|boolean',
            'country' => 'nullable|string|max:255',
            'address_line_1' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:255',
            'state' => 'nullable|string|max:255',
            'transaction' => 'nullable|array',
            'transaction.amount' => 'nullable|numeric',
            'transaction.currency' => 'nullable|string|size:3',
            'transaction.billing_cycle' => 'nullable|string|max:50',
            'transaction.payment_method' => 'nullable|string|max:50',
            'transaction.notes' => 'nullable|string|max:5000',
        ]);

        $exitCode = Artisan::call('tenants:create', [
            '--name' => $validated['name'],
            '--domain' => $validated['domain'],
            '--slug' => $validated['slug'],
            '--type' => $validated['tenancy_type'],
            '--admin-name' => $validated['admin_name'],
            '--admin-email' => $validated['admin_email'],
            '--admin-password' => $validated['admin_password'],
        ]);

        if ($exitCode !== 0) {
            return response()->json([
                'message' => 'Failed to create tenant',
                'output' => Artisan::output(),
            ], 500);
        }

        $isLifetime = $request->boolean('is_lifetime', false);
        $plan = $request->input('plan', 'basic');

        if ($plan !== 'custom' && !SubscriptionPlan::where('code', $plan)->where('is_active', true)->exists()) {
            return response()->json([
                'message' => 'Selected subscription plan is invalid.',
                'errors' => [
                    'plan' => ['Selected subscription plan is invalid.'],
                ],
            ], 422);
        }

        if (!$isLifetime && !$request->filled('end_date')) {
            return response()->json([
                'message' => 'The end date field is required when lifetime subscription is not enabled.',
                'errors' => [
                    'end_date' => ['The end date field is required.'],
                ],
            ], 422);
        }

        $tenant = Tenant::where('slug', $validated['slug'])->firstOrFail();

        $tenant->subscription_plan = $plan;
        $tenant->company_type = $request->input('company_type', 'General');
        $tenant->users_limit = $request->input('users_limit');
        $tenant->start_date = $request->input('start_date');
        $tenant->end_date = $isLifetime ? null : $request->input('end_date');
        $tenant->country = $request->input('country', $tenant->country);
        $tenant->city = $request->input('city', $tenant->city);
        $tenant->state = $request->input('state', $tenant->state);
        $tenant->address_line_1 = $request->input('address_line_1', $tenant->address_line_1);
        $tenant->address_line_2 = $request->input('address_line_2', $tenant->address_line_2);

        $meta = is_array($tenant->meta_data) ? $tenant->meta_data : [];
        $subscriptionMeta = $meta['subscription'] ?? [];
        $subscriptionMeta['is_lifetime'] = $isLifetime;
        $meta['subscription'] = $subscriptionMeta;
        $tenant->meta_data = $meta;

        $tenant->save();

        $modules = $request->input('modules', []);
        $this->tenantService->syncTenantModules($tenant, $plan, $modules);

        if ($this->subscriptionFeatureTablesExist() && $request->filled('transaction.amount') && $request->filled('transaction.currency')) {
            $contract = $this->contractService->createContract($tenant, [
                'plan_code' => $tenant->subscription_plan,
                'currency' => strtoupper((string) $request->input('transaction.currency')),
                'billing_cycle' => $request->input('transaction.billing_cycle', 'monthly'),
                'agreed_amount' => $request->input('transaction.amount'),
                'effective_from' => $tenant->start_date?->toDateString() ?? now()->toDateString(),
                'notes' => $request->input('transaction.notes'),
            ], $request->user());

            $transaction = $this->transactionService->record($tenant, [
                'contract_id' => $contract->id,
                'type' => 'creation',
                'currency' => strtoupper((string) $request->input('transaction.currency')),
                'total_amount' => $request->input('transaction.amount'),
                'payment_method' => $request->input('transaction.payment_method'),
                'period_start' => $tenant->start_date?->toDateString(),
                'period_end' => $tenant->end_date?->toDateString(),
                'notes' => $request->input('transaction.notes'),
                'plan_code' => $tenant->subscription_plan,
                'plan_label' => $tenant->subscription_plan,
            ], $request->user(), 'auto_system');

            $this->logSuperAdminActivity(
                $request->user(),
                'created',
                'tenant_subscription_contract_created',
                $contract,
                [
                    'tenant' => ['id' => $tenant->id, 'name' => $tenant->name],
                    'contract' => ['id' => $contract->id, 'plan_code' => $contract->plan_code, 'agreed_amount' => $contract->agreed_amount],
                ]
            );

            $this->logSuperAdminActivity(
                $request->user(),
                'created',
                'subscription_transaction_created',
                $transaction,
                [
                    'tenant' => ['id' => $tenant->id, 'name' => $tenant->name],
                    'transaction' => ['id' => $transaction->id, 'type' => $transaction->type, 'total_amount' => $transaction->total_amount, 'currency' => $transaction->currency],
                ]
            );
        }

        $this->logSuperAdminActivity(
            $request->user(),
            'created',
            'tenant_created',
            $tenant,
            [
                'attributes' => $tenant->fresh()->only(['id', 'name', 'domain', 'slug', 'subscription_plan', 'status', 'start_date', 'end_date']),
            ]
        );

        return response()->json([
            'message' => 'Tenant created successfully',
            'tenant' => $tenant,
        ], 201);
    }

    /**
     * Update tenant subscription details.
     */
    public function update(Request $request, Tenant $tenant)
    {
        $this->authorizeSuperAdmin($request);

        $owner = User::withoutGlobalScope('tenant')
            ->where('tenant_id', $tenant->id)
            ->orderBy('id')
            ->first();

        $ownerId = optional($owner)->id;

        $validated = $request->validate([
            'name' => 'nullable|string|max:255',
            'slug' => [
                'nullable',
                'string',
                'max:64',
                'regex:/^[a-z0-9\-]+$/',
                Rule::unique('tenants', 'slug')->ignore($tenant->id),
            ],
            'subscription_plan' => 'nullable|string|max:50',
            'company_type' => 'nullable|string|in:General,Real Estate',
            'status' => 'nullable|string|in:active,pending,expired,cancelled',
            'start_date' => 'nullable|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'is_lifetime' => 'nullable|boolean',
            'users_limit' => 'nullable|integer|min:1',
            'country' => 'nullable|string|max:255',
            'address_line_1' => 'nullable|string|max:255',
            'address_line_2' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:255',
            'state' => 'nullable|string|max:255',
            'modules' => 'nullable|array',
            // Do not require modules to already exist in DB; TenantService will create/sanitize module slugs.
            'modules.*' => ['string', 'regex:/^[a-z0-9_-]+$/i'],
            'admin_name' => 'nullable|string|max:255',
            'admin_email' => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('users', 'email')
                    ->ignore($ownerId)
                    ->where(function ($query) use ($tenant) {
                        return $query->where('tenant_id', $tenant->id);
                    }),
            ],
            'admin_password' => 'nullable|string|min:8',
            'transaction' => 'nullable|array',
            'transaction.amount' => 'nullable|numeric',
            'transaction.currency' => 'nullable|string|size:3',
            'transaction.billing_cycle' => 'nullable|string|max:50',
            'transaction.payment_method' => 'nullable|string|max:50',
            'transaction.notes' => 'nullable|string|max:5000',
        ]);

        $isLifetime = $request->boolean('is_lifetime', false);

        if ($isLifetime) {
            $validated['end_date'] = null;
        }

        if ($request->filled('subscription_plan')) {
            $planCode = $request->input('subscription_plan');
            if ($planCode !== 'custom' && !SubscriptionPlan::where('code', $planCode)->where('is_active', true)->exists()) {
                return response()->json([
                    'message' => 'Selected subscription plan is invalid.',
                    'errors' => [
                        'subscription_plan' => ['Selected subscription plan is invalid.'],
                    ],
                ], 422);
            }
        }

        $beforeAttributes = $tenant->only(['name', 'slug', 'subscription_plan', 'company_type', 'status', 'start_date', 'end_date', 'users_limit']);
        $oldPlan = $tenant->subscription_plan;
        $previousStatus = strtolower((string) ($tenant->status ?? ''));
        $previousEndDate = $tenant->end_date;
        $wasBlocked = $this->tenantAccessBlockedState($previousStatus, $previousEndDate);
        $tenant->update($validated);

        if ($request->has('is_lifetime')) {
            $meta = is_array($tenant->meta_data) ? $tenant->meta_data : [];
            $subscriptionMeta = $meta['subscription'] ?? [];
            $subscriptionMeta['is_lifetime'] = $isLifetime;
            $meta['subscription'] = $subscriptionMeta;
            $tenant->meta_data = $meta;
            $tenant->save();
        }

        $plan = $request->input('subscription_plan', $tenant->subscription_plan);
        if ($plan) {
            $modules = $request->input('modules', []);
            $this->tenantService->syncTenantModules($tenant, $plan, $modules);
        }

        if ($owner) {
            $dirty = false;

            if ($request->filled('admin_name')) {
                $owner->name = $request->admin_name;
                $dirty = true;
            }

            if ($request->filled('admin_email')) {
                $owner->email = $request->admin_email;
                $dirty = true;
            }

            if ($request->filled('admin_password')) {
                $owner->password = Hash::make($request->admin_password);
                $dirty = true;
            }

            if ($dirty) {
                $owner->save();
            }
        }

        $tenant->refresh();
        $currentStatus = strtolower((string) ($tenant->status ?? ''));
        $isBlocked = $this->tenantAccessShouldBeBlocked($tenant);
        $enteredBlockedState = !$wasBlocked && $isBlocked;
        $statusChangedToBlocked = $previousStatus !== $currentStatus && in_array($currentStatus, ['cancelled', 'suspended', 'expired'], true);

        if ($enteredBlockedState || $statusChangedToBlocked) {
            $this->tenantStatusService->revokeTenantUserTokens($tenant);
        }

        if ($this->subscriptionFeatureTablesExist() && $request->filled('transaction.amount') && $request->filled('transaction.currency')) {
            $contract = $this->contractService->createContract($tenant, [
                'plan_code' => $tenant->subscription_plan,
                'currency' => strtoupper((string) $request->input('transaction.currency')),
                'billing_cycle' => $request->input('transaction.billing_cycle', 'monthly'),
                'agreed_amount' => $request->input('transaction.amount'),
                'effective_from' => $request->input('start_date', optional($tenant->start_date)->toDateString() ?? now()->toDateString()),
                'notes' => $request->input('transaction.notes'),
            ], $request->user());

            $type = $this->transactionService->inferType($tenant, $oldPlan, $tenant->subscription_plan, false);
            $transaction = $this->transactionService->record($tenant, [
                'contract_id' => $contract->id,
                'type' => $type,
                'currency' => strtoupper((string) $request->input('transaction.currency')),
                'total_amount' => $request->input('transaction.amount'),
                'payment_method' => $request->input('transaction.payment_method'),
                'period_start' => optional($tenant->start_date)->toDateString(),
                'period_end' => optional($tenant->end_date)->toDateString(),
                'notes' => $request->input('transaction.notes'),
                'plan_code' => $tenant->subscription_plan,
                'plan_label' => $tenant->subscription_plan,
            ], $request->user(), 'auto_system');

            $this->logSuperAdminActivity(
                $request->user(),
                'created',
                'tenant_subscription_contract_created',
                $contract,
                [
                    'tenant' => ['id' => $tenant->id, 'name' => $tenant->name],
                    'contract' => ['id' => $contract->id, 'plan_code' => $contract->plan_code, 'agreed_amount' => $contract->agreed_amount],
                ]
            );

            $this->logSuperAdminActivity(
                $request->user(),
                'created',
                'subscription_transaction_created',
                $transaction,
                [
                    'tenant' => ['id' => $tenant->id, 'name' => $tenant->name],
                    'transaction' => ['id' => $transaction->id, 'type' => $transaction->type, 'total_amount' => $transaction->total_amount, 'currency' => $transaction->currency],
                ]
            );
        }

        $this->logSuperAdminActivity(
            $request->user(),
            'updated',
            'tenant_updated',
            $tenant,
            [
                'old' => $beforeAttributes,
                'attributes' => $tenant->only(['name', 'slug', 'subscription_plan', 'company_type', 'status', 'start_date', 'end_date', 'users_limit']),
            ]
        );

        return response()->json([
            'message' => 'Tenant updated successfully',
            'tenant' => $tenant
        ]);
    }

    public function archive(Request $request, Tenant $tenant)
    {
        $this->authorizeSuperAdmin($request);

        if ($tenant->archived_at) {
            return response()->json([
                'message' => 'Tenant is already archived.',
            ], 409);
        }

        if (strtolower((string) $tenant->status) !== 'cancelled') {
            return response()->json([
                'message' => 'Only cancelled tenants can be archived.',
            ], 422);
        }

        $activeContract = $this->subscriptionContractsTableExists()
            ? $tenant->subscriptionContracts()->whereNull('effective_to')->latest('effective_from')->first()
            : null;

        $tenant->archived_at = now();
        $tenant->save();
        $this->tenantStatusService->revokeTenantUserTokens($tenant);

        if ($this->subscriptionFeatureTablesExist()) {
            $tenant->subscriptionContracts()->whereNull('effective_to')->update([
                'effective_to' => now()->toDateString(),
            ]);

            $transaction = $this->transactionService->record($tenant, [
                'contract_id' => $activeContract?->id,
                'type' => 'cancellation',
                'status' => 'paid',
                'currency' => $activeContract?->currency ?: 'EGP',
                'total_amount' => 0,
                'notes' => 'Tenant archived after cancellation.',
                'period_end' => now()->toDateString(),
                'plan_code' => $activeContract?->plan_code ?: $tenant->subscription_plan,
                'plan_label' => $activeContract?->plan_code ?: $tenant->subscription_plan,
            ], $request->user(), 'auto_system');

            $this->logSuperAdminActivity(
                $request->user(),
                'created',
                'subscription_transaction_created',
                $transaction,
                [
                    'tenant' => ['id' => $tenant->id, 'name' => $tenant->name],
                    'transaction' => ['id' => $transaction->id, 'type' => $transaction->type, 'total_amount' => $transaction->total_amount, 'currency' => $transaction->currency],
                ]
            );
        }

        $this->logSuperAdminActivity(
            $request->user(),
            'updated',
            'tenant_archived',
            $tenant,
            [
                'attributes' => $tenant->only(['id', 'name', 'status', 'archived_at']),
            ]
        );

        return response()->json([
            'message' => 'Tenant archived successfully',
            'tenant' => $tenant,
        ]);
    }

    /**
     * List all users across all tenants.
     */
    public function users(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $perPage = max(10, min((int) $request->integer('per_page', 20), 200));

        $users = User::withoutGlobalScope('tenant')
            ->with('tenant')
            ->orderBy('name')
            ->paginate($perPage);

        return response()->json([
            'users' => $users
        ]);
    }

    /**
     * High-level platform stats for the Super Admin Dashboard.
     * Reads only from the landlord DB — zero impact on tenant data.
     */
    public function stats(Request $request)
    {
        $this->authorizeSuperAdmin($request);
        $this->tenantStatusService->syncExpiredTenants();

        $now                  = now();
        $thirtyDaysAgo        = $now->copy()->subDays(30);
        $startOfCurrentMonth  = $now->copy()->startOfMonth();
        $startOfPreviousMonth = $now->copy()->subMonth()->startOfMonth();
        $endOfPreviousMonth   = $now->copy()->subMonth()->endOfMonth();

        $tenantBase = Tenant::query()->whereNull('archived_at');

        $totalTenants   = (clone $tenantBase)->count();
        $activeTenants  = (clone $tenantBase)->where('status', 'active')->count();
        $expiredTenants = (clone $tenantBase)->where('status', 'expired')->count();
        $cancelledTenants = (clone $tenantBase)->where('status', 'cancelled')->count();
        $newLast30      = (clone $tenantBase)->where('created_at', '>=', $thirtyDaysAgo)->count();

        $newCurrentMonth = (clone $tenantBase)->where('created_at', '>=', $startOfCurrentMonth)->count();
        $newPreviousMonth = Tenant::query()
            ->whereBetween('created_at', [$startOfPreviousMonth, $endOfPreviousMonth])
            ->count();

        $totalAtMonthStart = (clone $tenantBase)->where('created_at', '<', $startOfCurrentMonth)->count();

        $activeAtMonthStart = (clone $tenantBase)
            ->where('created_at', '<', $startOfCurrentMonth)
            ->where(function ($query) use ($startOfCurrentMonth) {
                $query->where('status', 'active')
                    ->orWhere(function ($inner) use ($startOfCurrentMonth) {
                        $inner->where('status', '!=', 'active')
                            ->where('updated_at', '>=', $startOfCurrentMonth);
                    });
            })
            ->count();

        $statusEventsThisMonth = fn (string $status) => (clone $tenantBase)
            ->where('status', $status)
            ->where('updated_at', '>=', $startOfCurrentMonth)
            ->count();

        $statusEventsPreviousMonth = fn (string $status) => Tenant::query()
            ->where('status', $status)
            ->whereBetween('updated_at', [$startOfPreviousMonth, $endOfPreviousMonth])
            ->count();

        $kpiTrends = [
            'total_tenants' => [
                'delta' => $totalTenants - $totalAtMonthStart,
                'compare' => 'month_start',
            ],
            'active_tenants' => [
                'delta' => $activeTenants - $activeAtMonthStart,
                'compare' => 'month_start',
            ],
            'cancelled_tenants' => [
                'delta' => $statusEventsThisMonth('cancelled') - $statusEventsPreviousMonth('cancelled'),
                'compare' => 'previous_month',
            ],
            'new_last_30_days' => [
                'delta' => $newCurrentMonth - $newPreviousMonth,
                'compare' => 'previous_month',
            ],
            'expired_tenants' => [
                'delta' => $statusEventsThisMonth('expired') - $statusEventsPreviousMonth('expired'),
                'compare' => 'previous_month',
            ],
        ];

        // Tenants expiring within the next 30 days (active, non-lifetime)
        $expiringIn30 = Tenant::whereNull('archived_at')
            ->where('status', 'active')
            ->whereNotNull('end_date')
            ->whereBetween('end_date', [$now, $now->copy()->addDays(30)])
            ->count();

        // Monthly new tenants — last 6 months (for bar chart)
        $selectedYear = (int) $request->integer('year', $now->year);
        if ($selectedYear < 2000 || $selectedYear > ($now->year + 5)) {
            $selectedYear = $now->year;
        }

        $monthlyNew = [];
        for ($monthNumber = 1; $monthNumber <= 12; $monthNumber++) {
            $month = $now->copy()->setYear($selectedYear)->setMonth($monthNumber)->startOfMonth();
            $monthlyNew[] = [
                'month' => $month->format('M'),
                'label' => $month->format('M Y'),
                'count' => Tenant::whereNull('archived_at')
                    ->whereYear('created_at', $month->year)
                    ->whereMonth('created_at', $month->month)
                    ->count(),
            ];
        }

        $yearRange = Tenant::whereNull('archived_at')
            ->selectRaw('MIN(YEAR(created_at)) as min_year, MAX(YEAR(created_at)) as max_year')
            ->first();
        $firstYear = (int) ($yearRange?->min_year ?: $now->year);
        $lastYear  = max((int) ($yearRange?->max_year ?: $now->year), $now->year);
        $availableYears = [];
        for ($year = $lastYear; $year >= $firstYear; $year--) {
            $availableYears[] = $year;
        }

        // Plan distribution (for legend)
        $planDistribution = Tenant::whereNull('archived_at')
            ->selectRaw("COALESCE(subscription_plan, 'none') as plan, count(*) as count")
            ->groupBy('subscription_plan')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => ['plan' => $row->plan, 'count' => (int) $row->count]);

        // Status breakdown
        $statusBreakdown = Tenant::whereNull('archived_at')
            ->selectRaw("COALESCE(status, 'unknown') as status, count(*) as count")
            ->groupBy('status')
            ->get()
            ->map(fn ($row) => ['status' => $row->status, 'count' => (int) $row->count]);

        // Recent tenants — last 5 created
        $recentTenants = Tenant::whereNull('archived_at')
            ->latest()
            ->limit(5)
            ->get()
            ->map(fn ($t) => [
                'id'                => $t->id,
                'name'              => $t->name,
                'domain'            => $t->domain,
                'status'            => $t->status ?? 'unknown',
                'subscription_plan' => $t->subscription_plan ?? 'none',
                'created_at'        => $t->created_at?->toDateString(),
                'end_date'          => $t->end_date?->toDateString(),
            ]);

        // Expiring soon — active tenants expiring in next 30 days, ordered soonest first
        $expiringSoon = Tenant::whereNull('archived_at')
            ->where('status', 'active')
            ->whereNotNull('end_date')
            ->whereBetween('end_date', [$now, $now->copy()->addDays(30)])
            ->orderBy('end_date')
            ->limit(10)
            ->get()
            ->map(fn ($t) => [
                'id'      => $t->id,
                'name'    => $t->name,
                'domain'  => $t->domain,
                'end_date' => $t->end_date?->toDateString(),
                'days_left' => (int) $now->diffInDays($t->end_date, false),
            ]);

        // Company type breakdown
        $companyTypeBreakdown = Tenant::whereNull('archived_at')
            ->selectRaw("COALESCE(company_type, 'General') as company_type, count(*) as count")
            ->groupBy('company_type')
            ->get()
            ->map(fn ($row) => ['type' => $row->company_type, 'count' => (int) $row->count]);

        // Lifetime vs dated subscriptions
        $lifetimeCount = Tenant::whereNull('archived_at')->whereNull('end_date')->where('status', 'active')->count();
        $datedCount    = Tenant::whereNull('archived_at')->whereNotNull('end_date')->where('status', 'active')->count();

        return response()->json([
            'total_tenants'          => $totalTenants,
            'active_tenants'         => $activeTenants,
            'expired_tenants'        => $expiredTenants,
            'cancelled_tenants'      => $cancelledTenants,
            'new_last_30_days'       => $newLast30,
            'expiring_in_30'         => $expiringIn30,
            'selected_year'          => $selectedYear,
            'available_years'        => $availableYears,
            'monthly_new'            => $monthlyNew,
            'plan_distribution'      => $planDistribution,
            'status_breakdown'       => $statusBreakdown,
            'recent_tenants'         => $recentTenants,
            'expiring_soon'          => $expiringSoon,
            'company_type_breakdown' => $companyTypeBreakdown,
            'lifetime_count'         => $lifetimeCount,
            'dated_count'            => $datedCount,
            'kpi_trends'             => $kpiTrends,
        ]);
    }

    /**
     * Ensure the user is a super admin.
     */
    protected function authorizeSuperAdmin(Request $request)
    {
        if (!$request->user() || !$request->user()->is_super_admin) {
            abort(403, 'Super Admin access required.');
        }
    }

    protected function subscriptionContractsTableExists(): bool
    {
        return Schema::hasTable('tenant_subscription_contracts');
    }

    protected function subscriptionFeatureTablesExist(): bool
    {
        return $this->subscriptionContractsTableExists()
            && Schema::hasTable('subscription_transactions')
            && Schema::hasTable('subscription_transaction_items');
    }
}
