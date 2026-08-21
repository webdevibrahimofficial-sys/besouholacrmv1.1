<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Entity;
use App\Models\FieldValue;
use App\Models\InventoryRequest;
use App\Models\Lead;
use App\Models\Order;
use App\Models\Opportunity;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Notifications\NewCustomer;
use App\Traits\ResolvesNotificationRecipients;
use App\Traits\UserHierarchyTrait;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Support\Str;

class CustomerController extends Controller
{
    use UserHierarchyTrait;
    use ResolvesNotificationRecipients;
    
    private function normalizePhone($value)
    {
        $digits = preg_replace('/\D+/', '', (string) $value);
        if ($digits === '') {
            return '';
        }
        if (str_starts_with($digits, '20')) {
            if (strlen($digits) === 13 && substr($digits, 2, 1) === '0') {
                return substr($digits, 2);
            }
            if (strlen($digits) === 12) {
                return '0' . substr($digits, 2);
            }
        }
        return $digits;
    }

    /**
     * Conversion status labels wrongly stored as Source (e.g. "Converted Request").
     * Real source should remain the original lead/request marketing source.
     */
    private function isPlaceholderCustomerSource(?string $source): bool
    {
        $normalized = strtolower(trim(preg_replace('/\s+/', ' ', (string) $source)));

        return $normalized === ''
            || in_array($normalized, [
                'converted request',
                'converted from request',
                'real estate request',
            ], true);
    }

    private function findLinkedLead(
        ?int $tenantId,
        ?string $phone = null,
        ?array $meta = null,
        ?string $notes = null
    ): ?Lead {
        $meta = is_array($meta) ? $meta : [];
        $leadId = (int) ($meta['lead_id'] ?? $meta['leadId'] ?? 0);
        $requestId = (int) ($meta['converted_from_request_id'] ?? $meta['request_id'] ?? 0);

        if ($requestId <= 0 && is_string($notes) && preg_match('/Auto-created from Request\s+(\d+)/i', $notes, $m)) {
            $requestId = (int) $m[1];
        }

        if ($leadId <= 0 && $requestId > 0 && Schema::hasTable('inventory_requests')) {
            $request = InventoryRequest::query()
                ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
                ->find($requestId);

            if ($request) {
                $requestMeta = is_array($request->meta_data) ? $request->meta_data : [];
                $leadId = (int) ($requestMeta['lead_id'] ?? $requestMeta['leadId'] ?? 0);
            }
        }

        $leadQuery = Lead::query()
            ->with(['customFieldValues.field'])
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId));

        $lead = null;
        if ($leadId > 0) {
            $lead = (clone $leadQuery)->find($leadId);
        }

        if (! $lead && $phone) {
            $normalizedPhone = $this->normalizePhone($phone);
            if ($normalizedPhone !== '') {
                $lead = (clone $leadQuery)
                    ->where(function ($q) use ($phone, $normalizedPhone) {
                        $q->where('phone', $phone)
                            ->orWhere('phone', $normalizedPhone)
                            ->orWhere('phone', 'like', '%' . substr($normalizedPhone, -9));
                    })
                    ->orderByDesc('id')
                    ->first();
            }
        }

        return $lead;
    }

    private function resolveOriginalLeadSource(
        ?int $tenantId,
        ?string $phone = null,
        ?array $meta = null,
        ?string $notes = null
    ): ?string {
        $meta = is_array($meta) ? $meta : [];
        $requestId = (int) ($meta['converted_from_request_id'] ?? $meta['request_id'] ?? 0);

        if ($requestId <= 0 && is_string($notes) && preg_match('/Auto-created from Request\s+(\d+)/i', $notes, $m)) {
            $requestId = (int) $m[1];
        }

        // Prefer inventory request source when conversion came from a request
        if ($requestId > 0 && Schema::hasTable('inventory_requests')) {
            $request = InventoryRequest::query()
                ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
                ->find($requestId);

            if ($request) {
                $requestSource = trim((string) ($request->source ?? ''));
                if ($requestSource !== '' && ! $this->isPlaceholderCustomerSource($requestSource)) {
                    return $requestSource;
                }
            }
        }

        $lead = $this->findLinkedLead($tenantId, $phone, $meta, $notes);
        if (! $lead) {
            return null;
        }

        $leadSource = trim((string) ($lead->source ?? ''));
        if ($leadSource === '' || $this->isPlaceholderCustomerSource($leadSource)) {
            return null;
        }

        return $leadSource;
    }

    /**
     * Leads store free-text address in `location` (rarely `address` / custom fields).
     * Older rows sometimes stored the country name in `location` — skip that as address.
     *
     * @return array{address: string, country: string, city: string}
     */
    private function extractLeadAddressFields(Lead $lead): array
    {
        $meta = is_array($lead->meta_data) ? $lead->meta_data : [];
        $custom = is_array($lead->custom_fields ?? null) ? $lead->custom_fields : [];

        $country = trim((string) (
            $lead->country
            ?? ($meta['country'] ?? null)
            ?? ($custom['country'] ?? null)
            ?? ''
        ));
        $city = trim((string) (
            ($lead->getAttributes()['city'] ?? null)
            ?? ($meta['city'] ?? null)
            ?? ($custom['city'] ?? null)
            ?? ''
        ));

        $explicitAddress = trim((string) (
            ($lead->getAttributes()['address'] ?? null)
            ?? ($meta['address'] ?? null)
            ?? ($custom['address'] ?? null)
            ?? ''
        ));
        $location = trim((string) ($lead->location ?? ''));

        $address = $explicitAddress;
        if ($address === '' && $location !== '' && strcasecmp($location, $country) !== 0) {
            $address = $location;
        }

        return [
            'address' => $address,
            'country' => $country,
            'city' => $city,
        ];
    }

    /**
     * Fill empty customer address/country/city from linked lead (never overwrite non-empty).
     */
    private function applyLeadAddressFields(array &$data, ?Lead $lead): void
    {
        if (! $lead) {
            return;
        }

        $fields = $this->extractLeadAddressFields($lead);
        foreach (['address', 'country', 'city'] as $key) {
            $incoming = trim((string) ($data[$key] ?? ''));
            if ($incoming === '' && $fields[$key] !== '') {
                $data[$key] = $fields[$key];
            }
        }
    }

    private function backfillCustomerSources($customers, ?int $tenantId = null): void
    {
        if (! $customers) {
            return;
        }

        foreach ($customers as $customer) {
            if (! $customer instanceof Customer) {
                continue;
            }

            if (! $this->isPlaceholderCustomerSource($customer->source)) {
                continue;
            }

            $meta = is_array($customer->meta_data) ? $customer->meta_data : [];
            $resolved = $this->resolveOriginalLeadSource(
                $tenantId ?? ($customer->tenant_id ? (int) $customer->tenant_id : null),
                $customer->phone ? (string) $customer->phone : null,
                $meta,
                $customer->notes ? (string) $customer->notes : null
            );

            if (! $resolved) {
                continue;
            }

            $customer->source = $resolved;
            try {
                $customer->save();
            } catch (\Throwable $e) {
                // Keep in-memory value for response even if persist fails
            }
        }
    }

    /**
     * Soft backfill: only when customer address/country/city are empty and linked to a lead.
     * Never overwrites values the user already set.
     */
    private function backfillCustomerAddresses($customers, ?int $tenantId = null): void
    {
        if (! $customers) {
            return;
        }

        foreach ($customers as $customer) {
            if (! $customer instanceof Customer) {
                continue;
            }

            $needsAddress = trim((string) ($customer->address ?? '')) === '';
            $needsCountry = trim((string) ($customer->country ?? '')) === '';
            $needsCity = trim((string) ($customer->city ?? '')) === '';
            if (! $needsAddress && ! $needsCountry && ! $needsCity) {
                continue;
            }

            $meta = is_array($customer->meta_data) ? $customer->meta_data : [];
            $createdFrom = strtolower(trim((string) ($meta['created_from'] ?? '')));
            $hasLeadLink = ! empty($meta['lead_id']) || ! empty($meta['leadId'])
                || ! empty($meta['converted_from_request_id'])
                || $createdFrom === 'lead'
                || $createdFrom === 'inventory_request';

            if (! $hasLeadLink) {
                continue;
            }

            $lead = $this->findLinkedLead(
                $tenantId ?? ($customer->tenant_id ? (int) $customer->tenant_id : null),
                $customer->phone ? (string) $customer->phone : null,
                $meta,
                $customer->notes ? (string) $customer->notes : null
            );

            if (! $lead) {
                continue;
            }

            $fields = $this->extractLeadAddressFields($lead);
            $changed = false;

            if ($needsAddress && $fields['address'] !== '') {
                $customer->address = $fields['address'];
                $changed = true;
            }
            if ($needsCountry && $fields['country'] !== '') {
                $customer->country = $fields['country'];
                $changed = true;
            }
            if ($needsCity && $fields['city'] !== '') {
                $customer->city = $fields['city'];
                $changed = true;
            }

            if (! $changed) {
                continue;
            }

            try {
                $customer->save();
            } catch (\Throwable $e) {
                // Keep in-memory value for response even if persist fails
            }
        }
    }

    private function currentTenantId()
    {
        if (app()->bound('current_tenant_id')) {
            return app('current_tenant_id');
        }
        if (Auth::check()) {
            return Auth::user()?->tenant_id;
        }
        return null;
    }

    private function isTenantAdminUser($user): bool
    {
        if (! $user) {
            return false;
        }

        if (! empty($user->is_super_admin)) {
            return true;
        }

        $role = $this->normalizedUserRole($user);

        return in_array($role, ['admin', 'tenant admin', 'tenant-admin'], true);
    }

    private function normalizedUserRole($user): string
    {
        $role = strtolower(trim((string) ($user?->job_title ?: $user?->role ?: '')));
        $role = str_replace(['_', '-'], ' ', $role);

        return preg_replace('/\s+/', ' ', $role) ?: '';
    }

    private function canHoldDeleteCustomerPermission($user): bool
    {
        return in_array($this->normalizedUserRole($user), ['director', 'operation manager', 'operations manager'], true);
    }

    private function customerModulePermissions($user): array
    {
        $meta = is_array($user?->meta_data) ? $user->meta_data : [];
        $perms = $meta['module_permissions']['Customers'] ?? [];

        return is_array($perms) ? $perms : [];
    }

    private function canDeleteCustomer($user): bool
    {
        if (! $user) {
            return false;
        }

        if ($this->isTenantAdminUser($user)) {
            return true;
        }

        if (! $this->canHoldDeleteCustomerPermission($user)) {
            return false;
        }

        return in_array('deleteCustomer', $this->customerModulePermissions($user), true);
    }

    private function canForceDeleteCustomer($user): bool
    {
        return $this->isTenantAdminUser($user);
    }

    private function canAccessCustomerRecycle($user): bool
    {
        return $this->canDeleteCustomer($user);
    }

    private function hasActivePhoneConflict(Customer $customer): bool
    {
        $phone = trim((string) $customer->phone);
        if ($phone === '') {
            return false;
        }

        return Customer::query()
            ->where('phone', $phone)
            ->where('id', '!=', $customer->id)
            ->when($customer->tenant_id, fn ($q) => $q->where('tenant_id', $customer->tenant_id))
            ->exists();
    }

    private function applyCustomerListFilters($query, Request $request)
    {
        if ($q = trim((string) $request->input('q'))) {
            $query->where(function ($qbuilder) use ($q) {
                $qbuilder->where('name', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('customer_code', 'like', "%{$q}%")
                    ->orWhere('company_name', 'like', "%{$q}%");
            });
        }

        if ($customerCode = trim((string) $request->input('customer_code', ''))) {
            $query->where('customer_code', $customerCode);
        }

        if ($type = $request->input('type')) {
            $query->where('type', $type);
        }
        if ($source = $request->input('source')) {
            $query->where('source', $source);
        }
        if ($country = $request->input('country')) {
            $query->where('country', $country);
        }
        if ($city = $request->input('city')) {
            $query->where('city', $city);
        }
        if ($createdBy = $request->input('created_by')) {
            $query->where('created_by', $createdBy);
        }
        if ($assignedSalesRep = $request->input('assigned_sales_rep')) {
            $query->where(function ($inner) use ($assignedSalesRep) {
                $inner->where('assigned_to', $assignedSalesRep)
                    ->orWhereHas('assignee', function ($assignee) use ($assignedSalesRep) {
                        $assignee->where('name', $assignedSalesRep);
                    });
            });
        }

        $dateFrom = $request->input('date_from');
        $dateTo = $request->input('date_to');
        if ($dateFrom) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        return $query;
    }

    public function index(Request $request)
    {
        $perPage = (int) $request->input('per_page', 10);
        if ($perPage < 1) {
            $perPage = 10;
        }
        $sortBy = $request->input('sort_by', 'created_at');
        $sortOrder = strtolower($request->input('sort_order', 'desc')) === 'asc' ? 'asc' : 'desc';

        $query = Customer::with(['customFieldValues.field', 'assignee']);
        $this->applyCustomerListFilters($query, $request);

        // Sorting (whitelist)
        $allowedSort = ['created_at', 'name', 'customer_code', 'company_name', 'country', 'city', 'source'];
        if (!in_array($sortBy, $allowedSort, true)) {
            $sortBy = 'created_at';
        }
        $query->orderBy($sortBy, $sortOrder);

        if ($request->boolean('all')) {
            $customers = $query->get();
            $tenantId = $this->currentTenantId() ? (int) $this->currentTenantId() : null;
            $this->backfillCustomerSources($customers, $tenantId);
            $this->backfillCustomerAddresses($customers, $tenantId);

            return $customers;
        }

        $paginator = $query->paginate($perPage);
        $tenantId = $this->currentTenantId() ? (int) $this->currentTenantId() : null;
        $this->backfillCustomerSources($paginator->getCollection(), $tenantId);
        $this->backfillCustomerAddresses($paginator->getCollection(), $tenantId);

        return $paginator;
    }

    public function report(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $tenant = app()->bound('tenant') ? app('tenant') : null;
        if (!$tenant && $user->tenant_id) {
            $tenant = \App\Models\Tenant::query()->find($user->tenant_id);
        }
        $companyType = strtolower(trim((string) ($tenant?->company_type ?? '')));
        if ($companyType !== '' && str_contains($companyType, 'real')) {
            return response()->json([
                'message' => 'Customers Report is only available for General tenants',
            ], 403);
        }

        $perPage = (int) $request->input('per_page', 100);
        if ($perPage < 1) {
            $perPage = 100;
        }

        $query = Customer::with(['assignee.manager', 'customFieldValues.field'])
            ->orderByDesc('created_at');

        if ($user->tenant_id) {
            $query->where('tenant_id', $user->tenant_id);
        }

        $viewableUserIds = $this->getViewableUserIds($user, $request->input('manager_id'));
        if ($viewableUserIds !== null) {
            $query->whereIn('assigned_to', $viewableUserIds);
        }

        $salespersonFilter = trim((string) $request->input('salesperson', ''));
        if ($salespersonFilter !== '' && strcasecmp($salespersonFilter, 'all') !== 0) {
            $query->whereHas('assignee', fn ($q) => $q->where('name', $salespersonFilter));
        }

        $managerFilter = trim((string) $request->input('manager', ''));
        if ($managerFilter !== '' && strcasecmp($managerFilter, 'all') !== 0) {
            $query->whereHas('assignee.manager', fn ($q) => $q->where('name', $managerFilter));
        }

        $sourceFilter = trim((string) $request->input('source', ''));
        if ($sourceFilter !== '' && strcasecmp($sourceFilter, 'all') !== 0) {
            $query->where('source', $sourceFilter);
        }

        $clientTypeFilter = trim((string) $request->input('client_type', ''));
        if (strcasecmp($clientTypeFilter, 'Company') === 0) {
            $query->whereNotNull('company_name')->where('company_name', '!=', '');
        } elseif (strcasecmp($clientTypeFilter, 'Individual') === 0) {
            $query->where(function ($q) {
                $q->whereNull('company_name')->orWhere('company_name', '');
            });
        }

        if ($request->filled('date_from')) {
            $query->whereDate('created_at', '>=', $request->input('date_from'));
        }
        if ($request->filled('date_to')) {
            $query->whereDate('created_at', '<=', $request->input('date_to'));
        }

        if ($request->boolean('all')) {
            $allRows = $query->get();
            $paginator = new \Illuminate\Pagination\LengthAwarePaginator(
                $allRows,
                $allRows->count(),
                max($allRows->count(), 1),
                1,
                ['path' => $request->url(), 'query' => $request->query()]
            );
        } else {
            $paginator = $query->paginate($perPage);
        }
        $customerIds = $paginator->pluck('id')->all();

        $customerRows = $paginator->getCollection()->values();
        $customerCodes = $customerRows
            ->pluck('customer_code')
            ->filter(fn ($value) => filled($value))
            ->map(fn ($value) => trim((string) $value))
            ->unique()
            ->values()
            ->all();
        $customerNames = $customerRows
            ->pluck('name')
            ->filter(fn ($value) => filled($value))
            ->map(fn ($value) => trim((string) $value))
            ->unique()
            ->values()
            ->all();

        $visibleSalesNames = null;
        if ($viewableUserIds !== null) {
            $visibleSalesNames = User::query()
                ->whereIn('id', $viewableUserIds)
                ->pluck('name')
                ->filter(fn ($value) => filled($value))
                ->map(fn ($value) => trim((string) $value))
                ->values()
                ->all();
        }

        // Same admin visibility gate as QuotationController::index so report totals
        // align with the Sales Quotations page for the same user.
        $roleLower = strtolower((string) ($user->role ?? ''));
        $isAdminOrManager = !empty($user->is_super_admin)
            || in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager'], true);

        $matchesCustomer = function ($row, Customer $customer): bool {
            $rowCustomerId = trim((string) ($row->customer_id ?? ''));
            $customerId = trim((string) $customer->id);
            $customerCode = trim((string) ($customer->customer_code ?? ''));
            $rowCustomerCode = trim((string) ($row->customer_code ?? ''));
            $customerName = mb_strtolower(trim((string) ($customer->name ?? '')));
            $rowCustomerName = mb_strtolower(trim((string) ($row->customer_name ?? '')));

            // Numeric id (string/int) — also accept zero-padded forms via intval.
            if ($rowCustomerId !== '' && ctype_digit($rowCustomerId)) {
                if ((string) intval($rowCustomerId) === (string) intval($customerId)) {
                    return true;
                }
            } elseif ($rowCustomerId !== '' && $customerId !== '' && $rowCustomerId === $customerId) {
                return true;
            }

            // Frontend often stores customer_code in quotations.customer_id.
            if ($customerCode !== '') {
                if ($rowCustomerId !== '' && strcasecmp($rowCustomerId, $customerCode) === 0) {
                    return true;
                }
                if ($rowCustomerCode !== '' && strcasecmp($rowCustomerCode, $customerCode) === 0) {
                    return true;
                }
            }

            // Name fallback when there is no conflicting numeric/code id.
            if ($rowCustomerId !== '' && ctype_digit($rowCustomerId)) {
                return false;
            }
            if ($rowCustomerId !== '' && $customerCode !== '' && strcasecmp($rowCustomerId, $customerCode) !== 0) {
                // Non-digit id that does not match this customer's code — try name only if id empty.
                return false;
            }

            return $customerName !== '' && $rowCustomerName !== '' && $rowCustomerName === $customerName;
        };

        $normalizeQuotationStatus = function ($row): string {
            $status = strtolower(trim((string) ($row->status ?? '')));
            if ($status === '' || $status === 'draft') {
                return 'draft';
            }
            if (in_array($status, ['sent', 'pending'], true)) {
                return 'sent';
            }
            if (in_array($status, ['approved', 'converted', 'accepted'], true)) {
                return 'approved';
            }
            if (in_array($status, ['rejected', 'lost', 'cancelled', 'canceled'], true)) {
                return 'rejected';
            }

            return 'draft';
        };

        // Load quotations with the same visibility rules as /api/quotations (not only
        // quotes already linked to customers in this report page).
        $quotationScopeQuery = \App\Models\Quotation::query()
            ->when($user->tenant_id, fn ($sub) => $sub->where('tenant_id', $user->tenant_id));
        if (!$isAdminOrManager) {
            if ($viewableUserIds !== null) {
                $names = $visibleSalesNames ?? [];
                if ($names === []) {
                    $quotationScopeQuery->whereRaw('1 = 0');
                } else {
                    $quotationScopeQuery->whereIn('sales_person', $names);
                }
            } else {
                $quotationScopeQuery->where('sales_person', $user->name);
            }
        }
        if ($salespersonFilter !== '' && strcasecmp($salespersonFilter, 'all') !== 0) {
            $quotationScopeQuery->where('sales_person', $salespersonFilter);
        }
        $quotationRows = $quotationScopeQuery->get();

        $quotationStatusCounts = function ($rows) use ($normalizeQuotationStatus): array {
            $draft = 0;
            $sent = 0;
            $approved = 0;
            $rejected = 0;
            foreach ($rows as $row) {
                $bucket = $normalizeQuotationStatus($row);
                if ($bucket === 'sent') {
                    $sent++;
                } elseif ($bucket === 'approved') {
                    $approved++;
                } elseif ($bucket === 'rejected') {
                    $rejected++;
                } else {
                    $draft++;
                }
            }

            return [
                'quotationTotal' => $draft + $sent + $approved + $rejected,
                'quotationDraft' => $draft,
                'quotationSent' => $sent,
                'quotationApproved' => $approved,
                'quotationRejected' => $rejected,
            ];
        };

        $scopedQuotationStats = $quotationStatusCounts($quotationRows);

        $quotationTotalsPayload = [
            'total' => $scopedQuotationStats['quotationTotal'],
            'draft' => $scopedQuotationStats['quotationDraft'],
            'sent' => $scopedQuotationStats['quotationSent'],
            'approved' => $scopedQuotationStats['quotationApproved'],
            'rejected' => $scopedQuotationStats['quotationRejected'],
        ];

        $isOpenDocument = function ($row): bool {
            $status = strtolower(trim((string) ($row->status ?? '')));
            return $status !== '' && !in_array($status, ['draft', 'cancelled', 'canceled', 'void'], true);
        };

        // Same visibility rules as /api/orders (OrderController::index) so report KPI
        // totals align with the Sales Orders page for the same user — including orphans.
        $orderScopeQuery = Order::query()
            ->when($user->tenant_id, fn ($sub) => $sub->where('tenant_id', $user->tenant_id));
        if (!$isAdminOrManager) {
            if ($viewableUserIds !== null) {
                $names = $visibleSalesNames ?? [];
                if ($names === []) {
                    $orderScopeQuery->whereRaw('1 = 0');
                } else {
                    $orderScopeQuery->whereIn('sales_person', $names);
                }
            } else {
                $orderScopeQuery->where('sales_person', $user->name);
            }
        }
        if ($salespersonFilter !== '' && strcasecmp($salespersonFilter, 'all') !== 0) {
            $orderScopeQuery->where('sales_person', $salespersonFilter);
        }
        $ordersRows = $orderScopeQuery->get();

        // List page shows all statuses by default — KPI total matches that count.
        $orderOpenCount = $ordersRows->filter($isOpenDocument)->count();
        $orderDraftCount = $ordersRows->filter(function ($row) {
            return strtolower(trim((string) ($row->status ?? ''))) === 'draft';
        })->count();
        $orderCancelledCount = $ordersRows->filter(function ($row) {
            return in_array(strtolower(trim((string) ($row->status ?? ''))), ['cancelled', 'canceled', 'void'], true);
        })->count();

        $orderTotalsPayload = [
            'total' => $ordersRows->count(),
            'open' => $orderOpenCount,
            'draft' => $orderDraftCount,
            'cancelled' => $orderCancelledCount,
        ];

        // Same visibility rules as /api/sales-invoices so report KPI totals align
        // with the Sales Invoices page for the same user — including orphans.
        $invoicesScopedQuery = SalesInvoice::query()
            ->when($user->tenant_id, fn ($sub) => $sub->where('tenant_id', $user->tenant_id));
        if (!$isAdminOrManager) {
            if ($viewableUserIds !== null) {
                $names = $visibleSalesNames ?? [];
                if ($names === []) {
                    $invoicesScopedQuery->whereRaw('1 = 0');
                } else {
                    $invoicesScopedQuery->whereIn('sales_person', $names);
                }
            } else {
                $invoicesScopedQuery->where('sales_person', $user->name);
            }
        }
        if ($salespersonFilter !== '' && strcasecmp($salespersonFilter, 'all') !== 0) {
            $invoicesScopedQuery->where('sales_person', $salespersonFilter);
        }
        $invoicesRows = $invoicesScopedQuery->get();

        $paymentStatusOfRow = fn ($row) => strtolower(trim((string) ($row->payment_status ?? '')));
        $postedInvoicesAll = $invoicesRows->filter($isOpenDocument)->values();
        $invoiceTotalsPayload = [
            'total' => $invoicesRows->count(),
            'posted' => $postedInvoicesAll->count(),
            'billed' => (float) $postedInvoicesAll->sum(fn ($row) => (float) ($row->total ?? 0)),
            'collected' => (float) $postedInvoicesAll->sum(fn ($row) => (float) ($row->paid_amount ?? 0)),
            'paid_total' => (float) $postedInvoicesAll->filter(fn ($row) => $paymentStatusOfRow($row) === 'paid')->sum(fn ($row) => (float) ($row->total ?? 0)),
            'partial_total' => (float) $postedInvoicesAll->filter(fn ($row) => $paymentStatusOfRow($row) === 'partial')->sum(fn ($row) => (float) ($row->total ?? 0)),
            'unpaid_total' => (float) $postedInvoicesAll->filter(fn ($row) => !in_array($paymentStatusOfRow($row), ['paid', 'partial'], true))->sum(fn ($row) => (float) ($row->total ?? 0)),
        ];

        if (empty($customerIds)) {
            $payload = $paginator->toArray();
            $payload['data'] = [];
            $payload['quotation_totals'] = array_merge($quotationTotalsPayload, [
                'orphan_total' => $scopedQuotationStats['quotationTotal'],
            ]);
            $payload['order_totals'] = array_merge($orderTotalsPayload, [
                'orphan_total' => $ordersRows->count(),
            ]);
            $payload['invoice_totals'] = array_merge($invoiceTotalsPayload, [
                'orphan_total' => $invoicesRows->count(),
            ]);

            return response()->json($payload);
        }

        $extractItemLabel = function ($item): string {
            if (!is_array($item)) {
                return '';
            }

            foreach (['name', 'item_name', 'product_name', 'title', 'label', 'description'] as $key) {
                $value = trim((string) ($item[$key] ?? ''));
                if ($value !== '') {
                    return $value;
                }
            }

            return '';
        };

        $extractItemAmount = function ($item): float {
            if (!is_array($item)) {
                return 0.0;
            }

            foreach (['total', 'amount', 'line_total', 'subtotal'] as $key) {
                if (isset($item[$key]) && is_numeric($item[$key])) {
                    return (float) $item[$key];
                }
            }

            $qty = is_numeric($item['quantity'] ?? null) ? (float) $item['quantity'] : (is_numeric($item['qty'] ?? null) ? (float) $item['qty'] : 1.0);
            $price = is_numeric($item['price'] ?? null) ? (float) $item['price'] : (is_numeric($item['unit_price'] ?? null) ? (float) $item['unit_price'] : 0.0);

            return $qty * $price;
        };

        // $quotationRows / $ordersRows / $invoicesRows already loaded with list-page scope above.

        $opportunityRows = Opportunity::query()
            ->when($user->tenant_id, fn ($sub) => $sub->where('tenant_id', $user->tenant_id))
            ->where(function ($sub) use ($customerIds, $customerCodes, $customerNames) {
                $stringIds = array_map('strval', $customerIds);
                $sub->whereIn('customer_id', $stringIds);
                if (!empty($customerCodes)) {
                    $sub->orWhereIn('customer_id', $customerCodes);
                }
                if (!empty($customerNames)) {
                    $sub->orWhereIn('customer_name', $customerNames);
                }
            })
            ->get();

        $matchedQuotationIds = [];
        $matchedOrderIds = [];
        $matchedInvoiceIds = [];
        $collection = $paginator->getCollection()->map(function (Customer $customer) use ($ordersRows, $invoicesRows, $quotationRows, $opportunityRows, $matchesCustomer, $extractItemAmount, $extractItemLabel, $isOpenDocument, $normalizeQuotationStatus, &$matchedQuotationIds, &$matchedOrderIds, &$matchedInvoiceIds) {
            $matchedOrders = $ordersRows->filter(fn ($row) => $matchesCustomer($row, $customer))->values();
            $matchedInvoices = $invoicesRows->filter(fn ($row) => $matchesCustomer($row, $customer))->values();
            $matchedQuotations = $quotationRows->filter(fn ($row) => $matchesCustomer($row, $customer))->values();
            $matchedOpportunities = $opportunityRows->filter(fn ($row) => $matchesCustomer($row, $customer))->values();

            foreach ($matchedQuotations as $quote) {
                $matchedQuotationIds[(string) $quote->id] = true;
            }
            foreach ($matchedOrders as $order) {
                $matchedOrderIds[(string) $order->id] = true;
            }
            foreach ($matchedInvoices as $invoice) {
                $matchedInvoiceIds[(string) $invoice->id] = true;
            }

            $openOrders = $matchedOrders->filter($isOpenDocument)->values();
            $postedInvoices = $matchedInvoices->filter($isOpenDocument)->values();

            $ordersCount = $openOrders->count();
            $ordersTotal = (float) $openOrders->sum(fn ($row) => (float) ($row->total ?? 0));
            $billedTotal = (float) $postedInvoices->sum(fn ($row) => (float) ($row->total ?? 0));
            $collectedTotal = (float) $postedInvoices->sum(fn ($row) => (float) ($row->paid_amount ?? 0));
            $outstandingTotal = max(0, $billedTotal - $collectedTotal);

            $lastOrderAt = $openOrders->max('created_at');
            $lastInvoiceAt = $postedInvoices->map(fn ($row) => $row->issue_date ?: $row->created_at)->filter()->max();

            $lastActivity = collect([$lastOrderAt, $lastInvoiceAt])
                ->filter()
                ->max();

            $lastInvoiceSalesPerson = $postedInvoices->pluck('sales_person')->filter()->last();
            $salesperson = $customer->assignee ? $customer->assignee->name : $lastInvoiceSalesPerson;
            $manager = $customer->assignee && $customer->assignee->manager ? $customer->assignee->manager->name : null;

            $project = null;
            if ($customer->customFieldValues) {
                $projectField = $customer->customFieldValues->first(function($cfv) {
                     return $cfv->field && (
                         strtolower($cfv->field->name) === 'project' || 
                         strtolower($cfv->field->key) === 'project'
                     );
                });
                if ($projectField) {
                    $project = $projectField->value;
                }
            }

            $clientType = $customer->company_name ? 'Company' : 'Individual';

            $paymentStatusOf = fn ($row) => strtolower(trim((string) ($row->payment_status ?? '')));
            $paidInvoices = $postedInvoices->filter(fn ($row) => $paymentStatusOf($row) === 'paid');
            $partialInvoices = $postedInvoices->filter(fn ($row) => $paymentStatusOf($row) === 'partial');
            $unpaidInvoices = $postedInvoices->filter(fn ($row) => !in_array($paymentStatusOf($row), ['paid', 'partial'], true));

            $paidTotal = (float) $paidInvoices->sum(fn ($row) => (float) ($row->total ?? 0));
            $partialTotal = (float) $partialInvoices->sum(fn ($row) => (float) ($row->total ?? 0));
            $unpaidTotal = (float) $unpaidInvoices->sum(fn ($row) => (float) ($row->total ?? 0));
            $paidCollected = (float) $paidInvoices->sum(fn ($row) => (float) ($row->paid_amount ?? 0));
            $partialCollected = (float) $partialInvoices->sum(fn ($row) => (float) ($row->paid_amount ?? 0));
            $unpaidCollected = (float) $unpaidInvoices->sum(fn ($row) => (float) ($row->paid_amount ?? 0));
            $paidCount = $paidInvoices->count();
            $partialCount = $partialInvoices->count();
            $unpaidCount = $unpaidInvoices->count();

            $invoicesCount = $postedInvoices->count();
            $quotationTotal = $matchedQuotations->count();

            $quotationDraft = $matchedQuotations->filter(fn ($row) => $normalizeQuotationStatus($row) === 'draft')->count();
            $quotationSent = $matchedQuotations->filter(fn ($row) => $normalizeQuotationStatus($row) === 'sent')->count();
            $quotationApproved = $matchedQuotations->filter(fn ($row) => $normalizeQuotationStatus($row) === 'approved')->count();
            $quotationRejected = $matchedQuotations->filter(fn ($row) => $normalizeQuotationStatus($row) === 'rejected')->count();

            $opportunitiesCount = $matchedOpportunities->count();
            $revenueBreakdown = [];

            foreach ($postedInvoices as $row) {
                $items = is_array($row->items ?? null) ? $row->items : [];
                foreach ($items as $item) {
                    $label = $extractItemLabel($item);
                    if ($label === '') {
                        continue;
                    }

                    $amount = $extractItemAmount($item);
                    if ($amount <= 0) {
                        continue;
                    }

                    $revenueBreakdown[$label] = ($revenueBreakdown[$label] ?? 0) + $amount;
                }
            }

            return [
                'id' => $customer->id,
                'name' => $customer->name,
                'type' => $customer->type,
                'clientType' => $clientType,
                'manager' => $manager,
                'source' => $customer->source,
                'project' => $project,
                'phone' => $customer->phone,
                'email' => $customer->email,
                'address' => $customer->address,
                'country' => $customer->country,
                'city' => $customer->city,
                'joinedDate' => optional($customer->created_at)->toDateString(),
                'totalRevenue' => $collectedTotal,
                'billedTotal' => $billedTotal,
                'collectedTotal' => $collectedTotal,
                'outstandingTotal' => $outstandingTotal,
                'ordersTotal' => $ordersTotal,
                'orders' => $ordersCount,
                'lastActivity' => $lastActivity ? (method_exists($lastActivity, 'toDateString') ? $lastActivity->toDateString() : substr((string) $lastActivity, 0, 10)) : null,
                'salesperson' => $salesperson,
                'invoicePaidTotal' => $paidTotal,
                'invoicePartialTotal' => $partialTotal,
                'invoiceUnpaidTotal' => $unpaidTotal,
                'invoicePaidCollected' => $paidCollected,
                'invoicePartialCollected' => $partialCollected,
                'invoiceUnpaidCollected' => $unpaidCollected,
                'invoicePaidCount' => $paidCount,
                'invoicePartialCount' => $partialCount,
                'invoiceUnpaidCount' => $unpaidCount,
                'invoicesCount' => $invoicesCount,
                'quotationTotal' => $quotationTotal,
                'quotationDraft' => $quotationDraft,
                'quotationSent' => $quotationSent,
                'quotationApproved' => $quotationApproved,
                'quotationRejected' => $quotationRejected,
                // Backward-compatible aliases for older frontend builds
                'quotationPending' => $quotationSent,
                'quotationConverted' => $quotationApproved,
                'quotationLost' => $quotationRejected,
                'opportunitiesCount' => $opportunitiesCount,
                'revenueBreakdown' => $revenueBreakdown,
            ];
        });

        $orphanQuotations = $quotationRows->filter(
            fn ($row) => !isset($matchedQuotationIds[(string) $row->id])
        );
        $orphanStats = $quotationStatusCounts($orphanQuotations);

        $orphanOrders = $ordersRows->filter(
            fn ($row) => !isset($matchedOrderIds[(string) $row->id])
        );
        $orphanOrderOpen = $orphanOrders->filter($isOpenDocument)->count();
        $orphanOrderDraft = $orphanOrders->filter(function ($row) {
            return strtolower(trim((string) ($row->status ?? ''))) === 'draft';
        })->count();
        $orphanOrderCancelled = $orphanOrders->filter(function ($row) {
            return in_array(strtolower(trim((string) ($row->status ?? ''))), ['cancelled', 'canceled', 'void'], true);
        })->count();

        $paginator->setCollection($collection);

        $payload = $paginator->toArray();
        $payload['quotation_totals'] = array_merge($quotationTotalsPayload, [
            'orphan_total' => $orphanStats['quotationTotal'],
            'orphan_draft' => $orphanStats['quotationDraft'],
            'orphan_sent' => $orphanStats['quotationSent'],
            'orphan_approved' => $orphanStats['quotationApproved'],
            'orphan_rejected' => $orphanStats['quotationRejected'],
        ]);
        $payload['order_totals'] = array_merge($orderTotalsPayload, [
            'orphan_total' => $orphanOrders->count(),
            'orphan_open' => $orphanOrderOpen,
            'orphan_draft' => $orphanOrderDraft,
            'orphan_cancelled' => $orphanOrderCancelled,
        ]);

        $orphanInvoices = $invoicesRows->filter(
            fn ($row) => !isset($matchedInvoiceIds[(string) $row->id])
        );
        $payload['invoice_totals'] = array_merge($invoiceTotalsPayload, [
            'orphan_total' => $orphanInvoices->count(),
        ]);

        return response()->json($payload);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $tenantId = $this->currentTenantId() ? (int) $this->currentTenantId() : null;
        $camelCaseAliases = [
            'companyName' => 'company_name',
            'addressLine' => 'address',
            'assignedSalesRep' => 'assigned_to',
            'createdBy' => 'created_by',
            'customerCode' => 'customer_code',
            'taxNumber' => 'tax_number',
        ];

        $normalizedInput = [];
        foreach ($camelCaseAliases as $from => $to) {
            if (
                $request->exists($from) &&
                ! $request->exists($to)
            ) {
                $normalizedInput[$to] = $request->input($from);
            }
        }

        $normalizedInput['phone'] = $this->normalizePhone($request->input('phone'));
        $request->merge($normalizedInput);

        // 1. Validate Standard Fields
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'customer_code' => 'nullable|string|max:50',
            'phone' => [
                'required',
                'string',
                'max:255',
                Rule::unique('customers', 'phone')->where(function ($q) use ($tenantId) {
                    return $tenantId ? $q->where('tenant_id', $tenantId) : $q->whereNull('tenant_id');
                }),
            ],
            'email' => 'nullable|email|max:255',
            'type' => 'nullable|string|max:50',
            'source' => 'required|string|max:100',
            'company_name' => 'nullable|string|max:255',
            'tax_number' => 'nullable|string|max:50',
            'country' => 'nullable|string|max:100',
            'city' => 'nullable|string|max:100',
            'address' => 'nullable|string|max:255',
            'assigned_to' => 'nullable|string|max:255',
            'created_by' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
            'meta_data' => 'nullable|array',
        ], [
            'phone.unique' => 'رقم التليفون مسجل بالفعل لعميل آخر',
            'source.required' => 'المصدر مطلوب',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $validatedData = $validator->validated();

        // Always persist a creator name (lead convert / import often omit created_by)
        $createdBy = trim((string) ($validatedData['created_by'] ?? ''));
        if ($createdBy === '') {
            $validatedData['created_by'] = Auth::user()?->name ?: 'System';
        }

        $metaData = is_array($validatedData['meta_data'] ?? null) ? $validatedData['meta_data'] : [];
        if ($request->filled('lead_id') && empty($metaData['lead_id'])) {
            $metaData['lead_id'] = (int) $request->input('lead_id');
        }

        $incomingSource = trim((string) ($validatedData['source'] ?? ''));
        $linkedLead = null;
        if ($this->isPlaceholderCustomerSource($incomingSource) || ! empty($metaData['lead_id']) || ! empty($metaData['converted_from_request_id'])) {
            $linkedLead = $this->findLinkedLead(
                $tenantId,
                $validatedData['phone'] ?? null,
                $metaData,
                $validatedData['notes'] ?? null
            );

            $resolvedSource = $this->resolveOriginalLeadSource(
                $tenantId,
                $validatedData['phone'] ?? null,
                $metaData,
                $validatedData['notes'] ?? null
            );
            if ($resolvedSource) {
                $validatedData['source'] = $resolvedSource;
            } elseif ($this->isPlaceholderCustomerSource($incomingSource)) {
                // Never persist conversion labels as Source
                $validatedData['source'] = 'Unknown';
            }
        }

        // Copy lead address/country/city onto new customer when those fields are empty
        $this->applyLeadAddressFields($validatedData, $linkedLead);

        if (! empty($metaData)) {
            $validatedData['meta_data'] = $metaData;
        } else {
            unset($validatedData['meta_data']);
        }

        // 2. Validate Custom Fields
        $entity = Entity::where('key', 'customers')->first();
        if ($entity) {
            $customFields = $entity->fields;
            $customRules = [];
            
            foreach ($customFields as $field) {
                if ($field->required && $field->active) {
                    $customRules['custom_fields.' . $field->key] = 'required';
                }
            }
            
            if (!empty($customRules)) {
                $customValidator = Validator::make($request->all(), $customRules);
                if ($customValidator->fails()) {
                     return response()->json(['errors' => $customValidator->errors()], 422);
                }
            }
        }

        try {
            DB::beginTransaction();

            // 3. Create Customer
            $customer = Customer::create($validatedData);
            $crm = \App\Models\CrmSetting::first();
            $settings = is_array($crm?->settings) ? $crm->settings : [];
            
            if (!$request->filled('customer_code')) {
                $startCode = (string) ($settings['startCustomerCode'] ?? '0001');
                
                // Extract prefix and number (e.g., "C-" and "1000")
                if (preg_match('/^([^\d]*)(\d+)$/', $startCode, $matches)) {
                    $prefix = $matches[1];
                    $startNumber = intval($matches[2]);
                    $numberWidth = strlen($matches[2]);

                    // Find the max number currently used with this prefix
                    // We look for codes starting with prefix and followed by digits
                    // Since SQL regex is limited, we fetch candidates and parse in PHP 
                    // (Not optimal for huge datasets but safe for now)
                    $maxCodeCustomer = Customer::where('customer_code', 'like', $prefix . '%')
                        ->where('id', '!=', $customer->id) // Exclude current if it somehow got a code
                        ->get()
                        ->filter(function($c) use ($prefix) {
                            return preg_match('/^' . preg_quote($prefix, '/') . '\d+$/', $c->customer_code);
                        })
                        ->sortByDesc(function($c) use ($prefix) {
                            return intval(substr($c->customer_code, strlen($prefix)));
                        })
                        ->first();

                    $nextNumber = $startNumber;
                    if ($maxCodeCustomer) {
                        $currentMax = intval(substr($maxCodeCustomer->customer_code, strlen($prefix)));
                        if ($currentMax >= $startNumber) {
                            $nextNumber = $currentMax + 1;
                        }
                    }

                    $customer->customer_code = $prefix . str_pad((string) $nextNumber, $numberWidth, '0', STR_PAD_LEFT);
                } else {
                    // Fallback if pattern doesn't match
                    $customer->customer_code = $startCode . '-' . $customer->id;
                }
                $customer->save();
            }

            // 4. Save Custom Fields
            if ($request->has('custom_fields') && $entity) {
                $fieldsMap = $entity->fields->pluck('id', 'key');
                
                foreach ($request->input('custom_fields') as $key => $value) {
                    if (isset($fieldsMap[$key])) {
                        FieldValue::create([
                            'field_id' => $fieldsMap[$key],
                            'record_id' => $customer->id,
                            'value' => $value,
                        ]);
                    }
                }
            }

            DB::commit();

            try {
                if (Auth::check()) {
                    /** @var \App\Models\User $user */
                    $user = Auth::user();
                    $assignee = null;
                    if (!empty($customer->assigned_to) && is_numeric($customer->assigned_to)) {
                        $assignee = User::with(['manager', 'team.leader'])->find($customer->assigned_to);
                    }

                    $baseUser = $assignee ?: $user;
                    $notification = new NewCustomer($customer, $user->name);

                    $recipients = $this->buildNotificationRecipients(
                        $baseUser,
                        [
                            'owner' => $user,
                            'assignee' => $assignee,
                            'assigner' => $user,
                        ],
                        'customers',
                        'notify_add_customer'
                    );

                    foreach ($recipients as $recipient) {
                        try {
                            $recipient->notify($notification);
                        } catch (\Throwable $e) {
                            Log::error("Failed to send customer notification to recipient {$recipient->id}: " . $e->getMessage());
                        }
                    }
                }
            } catch (\Exception $ne) {
                Log::error("Failed to build or send customer notifications: " . $ne->getMessage());
            }

            return response()->json($customer->load(['customFieldValues.field', 'assignee']), 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to create customer', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Display the specified resource.
     */
    public function show($id)
    {
        $customer = Customer::with('customFieldValues.field')->findOrFail($id);
        $tenantId = $this->currentTenantId() ? (int) $this->currentTenantId() : null;
        $this->backfillCustomerSources(collect([$customer]), $tenantId);
        $this->backfillCustomerAddresses(collect([$customer]), $tenantId);

        return $customer;
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, $id)
    {
        $customer = Customer::findOrFail($id);
        $tenantId = $this->currentTenantId();

        if ($request->has('phone')) {
            $request->merge(['phone' => $this->normalizePhone($request->input('phone'))]);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'customer_code' => 'nullable|string|max:50',
            'phone' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('customers', 'phone')->ignore($customer->id)->where(function ($q) use ($tenantId) {
                    return $tenantId ? $q->where('tenant_id', $tenantId) : $q->whereNull('tenant_id');
                }),
            ],
            'email' => 'nullable|email|max:255',
            'type' => 'nullable|string|max:50',
            'source' => 'sometimes|required|string|max:100',
            'company_name' => 'nullable|string|max:255',
            'tax_number' => 'nullable|string|max:50',
            'country' => 'nullable|string|max:100',
            'city' => 'nullable|string|max:100',
            'address' => 'nullable|string|max:255',
            'assigned_to' => 'nullable|string|max:255',
            'created_by' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
        ], [
            'phone.unique' => 'رقم التليفون مسجل بالفعل لعميل آخر',
            'source.required' => 'المصدر مطلوب',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            DB::beginTransaction();

            $customer->update($request->except('custom_fields'));

            // Update Custom Fields
            $entity = Entity::where('key', 'customers')->first();
            if ($request->has('custom_fields') && $entity) {
                $fieldsMap = $entity->fields->pluck('id', 'key');
                
                foreach ($request->input('custom_fields') as $key => $value) {
                    if (isset($fieldsMap[$key])) {
                        FieldValue::updateOrCreate(
                            [
                                'field_id' => $fieldsMap[$key],
                                'record_id' => $customer->id,
                            ],
                            ['value' => $value]
                        );
                    }
                }
            }

            DB::commit();
            return response()->json($customer->load(['customFieldValues.field', 'assignee']));

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to update customer', 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * Move the customer to the recycle bin.
     */
    public function destroy($id)
    {
        $user = Auth::user();
        if (! $this->canDeleteCustomer($user)) {
            return response()->json(['message' => 'You do not have permission to delete customers.'], 403);
        }

        $customer = Customer::findOrFail($id);
        $customer->deleted_by = $user?->id;
        $customer->save();
        $customer->delete();

        return response()->json(['message' => 'Customer moved to recycle bin successfully']);
    }

    public function recycleBin(Request $request)
    {
        $user = $request->user();
        if (! $this->canAccessCustomerRecycle($user)) {
            return response()->json(['message' => 'You do not have permission to view the customer recycle bin.'], 403);
        }

        $query = Customer::onlyTrashed()
            ->with(['deletedByUser:id,name', 'assignee:id,name', 'customFieldValues.field'])
            ->orderByDesc('deleted_at');

        if ($user?->tenant_id) {
            $query->where('tenant_id', $user->tenant_id);
        }

        $this->applyCustomerListFilters($query, $request);

        $perPage = max(1, min(100, (int) $request->input('per_page', 20)));

        return $query->paginate($perPage);
    }

    public function restoreFromRecycle($id)
    {
        $user = Auth::user();
        if (! $this->canAccessCustomerRecycle($user)) {
            return response()->json(['message' => 'You do not have permission to restore customers.'], 403);
        }

        $customer = Customer::onlyTrashed()->findOrFail($id);

        if ($this->hasActivePhoneConflict($customer)) {
            return response()->json([
                'message' => 'Cannot restore this customer because another active customer already uses the same phone number.',
            ], 422);
        }

        $customer->deleted_by = null;
        $customer->restore();

        return response()->json(['message' => 'Customer restored successfully', 'customer' => $customer->fresh()]);
    }

    public function forceDelete($id)
    {
        $user = Auth::user();
        if (! $this->canForceDeleteCustomer($user)) {
            return response()->json(['message' => 'You do not have permission to permanently delete customers.'], 403);
        }

        $customer = Customer::withTrashed()->findOrFail($id);
        $customer->forceDelete();

        return response()->json(['message' => 'Customer permanently deleted']);
    }

    public function bulkDelete(Request $request)
    {
        $user = Auth::user();
        if (! $this->canDeleteCustomer($user)) {
            return response()->json(['message' => 'You do not have permission to delete customers.'], 403);
        }

        $ids = array_values(array_filter(array_map('intval', (array) $request->input('ids', []))));
        if ($ids === []) {
            return response()->json(['message' => 'No customers selected.'], 422);
        }

        $query = Customer::query()->whereIn('id', $ids);
        if ($user?->tenant_id) {
            $query->where('tenant_id', $user->tenant_id);
        }

        $count = 0;
        $query->get()->each(function (Customer $customer) use ($user, &$count) {
            $customer->deleted_by = $user?->id;
            $customer->save();
            $customer->delete();
            $count++;
        });

        return response()->json([
            'message' => 'Customers moved to recycle bin successfully',
            'count' => $count,
        ]);
    }

    public function bulkRestore(Request $request)
    {
        $user = Auth::user();
        if (! $this->canAccessCustomerRecycle($user)) {
            return response()->json(['message' => 'You do not have permission to restore customers.'], 403);
        }

        $ids = array_values(array_filter(array_map('intval', (array) $request->input('ids', []))));
        if ($ids === []) {
            return response()->json(['message' => 'No customers selected.'], 422);
        }

        $query = Customer::onlyTrashed()->whereIn('id', $ids);
        if ($user?->tenant_id) {
            $query->where('tenant_id', $user->tenant_id);
        }

        $count = 0;
        $query->get()->each(function (Customer $customer) use (&$count) {
            if ($this->hasActivePhoneConflict($customer)) {
                return;
            }
            $customer->deleted_by = null;
            $customer->restore();
            $count++;
        });

        return response()->json([
            'message' => 'Customers restored successfully',
            'count' => $count,
        ]);
    }

    public function bulkForceDelete(Request $request)
    {
        $user = Auth::user();
        if (! $this->canForceDeleteCustomer($user)) {
            return response()->json(['message' => 'You do not have permission to permanently delete customers.'], 403);
        }

        $ids = array_values(array_filter(array_map('intval', (array) $request->input('ids', []))));
        if ($ids === []) {
            return response()->json(['message' => 'No customers selected.'], 422);
        }

        $query = Customer::withTrashed()->whereIn('id', $ids);
        if ($user?->tenant_id) {
            $query->where('tenant_id', $user->tenant_id);
        }

        $count = $query->count();
        $query->get()->each(fn (Customer $customer) => $customer->forceDelete());

        return response()->json([
            'message' => 'Customers permanently deleted',
            'count' => $count,
        ]);
    }

    public function attachmentsIndex($id)
    {
        $customer = Customer::findOrFail($id);
        $meta = is_array($customer->meta_data) ? $customer->meta_data : [];
        $attachments = $meta['attachments'] ?? [];
        if (!is_array($attachments)) {
            $attachments = [];
        }
        return response()->json([
            'attachments' => array_values($attachments),
        ]);
    }

    public function attachmentsStore(Request $request, $id)
    {
        $customer = Customer::findOrFail($id);

        $request->validate([
            'attachments' => 'nullable|array',
            'attachments.*' => 'file|max:10240', // 10MB each
        ]);

        $allFiles = $request->allFiles();
        $files = $allFiles['attachments'] ?? [];
        if (!is_array($files)) {
            $files = [$files];
        }

        $tenantId = $this->currentTenantId() ?: ($customer->tenant_id ?? 'na');
        $baseDir = "tenants/{$tenantId}/customers/{$customer->id}/attachments";

        $meta = is_array($customer->meta_data) ? $customer->meta_data : [];
        $attachments = $meta['attachments'] ?? [];
        if (!is_array($attachments)) {
            $attachments = [];
        }

        foreach ($files as $file) {
            if (!$file) {
                continue;
            }
            $attachmentId = (string) Str::uuid();
            $originalName = $file->getClientOriginalName();
            $ext = $file->getClientOriginalExtension();
            $safeName = pathinfo($originalName, PATHINFO_FILENAME);
            $safeName = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string) $safeName);
            $finalName = $safeName . '_' . $attachmentId . ($ext ? '.' . $ext : '');

            $path = $file->storeAs($baseDir, $finalName, 'public');

            $attachments[] = [
                'id' => $attachmentId,
                'name' => $originalName,
                'type' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'path' => $path,
                'url' => Storage::disk('public')->url($path),
                'uploaded_at' => now()->toISOString(),
                'uploaded_by' => Auth::user()?->name ?? null,
            ];
        }

        $meta['attachments'] = array_values($attachments);
        $customer->meta_data = $meta;
        $customer->save();

        return response()->json([
            'attachments' => array_values($meta['attachments'] ?? []),
        ]);
    }

    public function attachmentsDestroy($id, $attachmentId)
    {
        $customer = Customer::findOrFail($id);
        $meta = is_array($customer->meta_data) ? $customer->meta_data : [];
        $attachments = $meta['attachments'] ?? [];
        if (!is_array($attachments)) {
            $attachments = [];
        }

        $remaining = [];
        foreach ($attachments as $att) {
            if (!is_array($att)) {
                continue;
            }
            if ((string) ($att['id'] ?? '') === (string) $attachmentId) {
                $path = $att['path'] ?? null;
                if ($path) {
                    try {
                        Storage::disk('public')->delete($path);
                    } catch (\Throwable $e) {
                    }
                }
                continue;
            }
            $remaining[] = $att;
        }

        $meta['attachments'] = array_values($remaining);
        $customer->meta_data = $meta;
        $customer->save();

        return response()->json([
            'attachments' => array_values($meta['attachments'] ?? []),
        ]);
    }

    public function commentsIndex($id)
    {
        $customer = Customer::findOrFail($id);
        $meta = is_array($customer->meta_data) ? $customer->meta_data : [];
        $comments = $meta['comments'] ?? [];
        if (!is_array($comments)) {
            $comments = [];
        }
        return response()->json([
            'comments' => array_values($comments),
        ]);
    }

    public function commentsStore(Request $request, $id)
    {
        $customer = Customer::findOrFail($id);
        $validated = $request->validate([
            'text' => 'required|string|max:5000',
        ]);

        $meta = is_array($customer->meta_data) ? $customer->meta_data : [];
        $comments = $meta['comments'] ?? [];
        if (!is_array($comments)) {
            $comments = [];
        }

        $comment = [
            'id' => (string) Str::uuid(),
            'text' => $validated['text'],
            'author' => Auth::user()?->name ?? null,
            'created_at' => now()->toISOString(),
        ];
        $comments[] = $comment;

        $meta['comments'] = array_values($comments);
        $customer->meta_data = $meta;
        $customer->save();

        return response()->json([
            'comment' => $comment,
            'comments' => array_values($meta['comments'] ?? []),
        ]);
    }
}
