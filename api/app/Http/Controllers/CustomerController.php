<?php

namespace App\Http\Controllers;

use App\Models\Customer;
use App\Models\Entity;
use App\Models\FieldValue;
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

    public function index(Request $request)
    {
        $perPage = (int) $request->input('per_page', 10);
        if ($perPage < 1) {
            $perPage = 10;
        }
        $sortBy = $request->input('sort_by', 'created_at');
        $sortOrder = strtolower($request->input('sort_order', 'desc')) === 'asc' ? 'asc' : 'desc';

        $query = Customer::with(['customFieldValues.field', 'assignee']);

        // Search
        if ($q = trim((string) $request->input('q'))) {
            $query->where(function ($qbuilder) use ($q) {
                $qbuilder->where('name', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%")
                    ->orWhere('customer_code', 'like', "%{$q}%")
                    ->orWhere('company_name', 'like', "%{$q}%");
            });
        }

        // Filters
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
            $query->where('assigned_to', $assignedSalesRep);
        }
        // Date range
        $dateFrom = $request->input('date_from');
        $dateTo = $request->input('date_to');
        if ($dateFrom) {
            $query->whereDate('created_at', '>=', $dateFrom);
        }
        if ($dateTo) {
            $query->whereDate('created_at', '<=', $dateTo);
        }

        // Sorting (whitelist)
        $allowedSort = ['created_at', 'name', 'customer_code', 'company_name', 'country', 'city', 'source'];
        if (!in_array($sortBy, $allowedSort, true)) {
            $sortBy = 'created_at';
        }
        $query->orderBy($sortBy, $sortOrder);

        if ($request->boolean('all')) {
            return $query->get();
        }
        return $query->paginate($perPage);
    }

    public function report(Request $request)
    {
        $perPage = (int) $request->input('per_page', 100);
        if ($perPage < 1) {
            $perPage = 100;
        }

        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
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

        $paginator = $query->paginate($perPage);
        $customerIds = $paginator->pluck('id')->all();

        if (empty($customerIds)) {
            return response()->json($paginator);
        }

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

        $matchesCustomer = function ($row, Customer $customer): bool {
            $rowCustomerId = trim((string) ($row->customer_id ?? ''));
            $customerId = trim((string) $customer->id);
            $customerCode = trim((string) ($customer->customer_code ?? ''));
            $rowCustomerCode = trim((string) ($row->customer_code ?? ''));
            $customerName = mb_strtolower(trim((string) ($customer->name ?? '')));
            $rowCustomerName = mb_strtolower(trim((string) ($row->customer_name ?? '')));

            if ($rowCustomerId !== '' && $rowCustomerId === $customerId) {
                return true;
            }

            if ($customerCode !== '') {
                if ($rowCustomerId !== '' && $rowCustomerId === $customerCode) {
                    return true;
                }
                if ($rowCustomerCode !== '' && $rowCustomerCode === $customerCode) {
                    return true;
                }
            }

            return $customerName !== '' && $rowCustomerName !== '' && $rowCustomerName === $customerName;
        };

        $applySalesScope = function ($query, ?string $salesPersonColumn = 'sales_person') use ($user, $visibleSalesNames) {
            if ($visibleSalesNames === null) {
                return $query;
            }

            return $query->whereIn($salesPersonColumn, $visibleSalesNames);
        };

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

        $ordersRows = $applySalesScope(
            Order::query()
                ->when($user->tenant_id, fn ($sub) => $sub->where('tenant_id', $user->tenant_id))
                ->where(function ($sub) use ($customerIds, $customerCodes, $customerNames) {
                    $sub->whereIn('customer_id', $customerIds);
                    if (!empty($customerCodes)) {
                        $sub->orWhereIn('customer_code', $customerCodes);
                    }
                    if (!empty($customerNames)) {
                        $sub->orWhereIn('customer_name', $customerNames);
                    }
                })
        )->get();

        $invoicesRows = $applySalesScope(
            SalesInvoice::query()
                ->when($user->tenant_id, fn ($sub) => $sub->where('tenant_id', $user->tenant_id))
                ->where(function ($sub) use ($customerIds, $customerCodes, $customerNames) {
                    $sub->whereIn('customer_id', $customerIds);
                    if (!empty($customerCodes)) {
                        $sub->orWhereIn('customer_code', $customerCodes);
                    }
                    if (!empty($customerNames)) {
                        $sub->orWhereIn('customer_name', $customerNames);
                    }
                })
        )->get();

        $quotationRows = $applySalesScope(
            \App\Models\Quotation::query()
                ->when($user->tenant_id, fn ($sub) => $sub->where('tenant_id', $user->tenant_id))
                ->where(function ($sub) use ($customerIds, $customerCodes, $customerNames) {
                    $stringIds = array_map('strval', $customerIds);
                    $sub->whereIn('customer_id', $stringIds);
                    if (!empty($customerCodes)) {
                        $sub->orWhereIn('customer_id', $customerCodes)
                            ->orWhereIn('customer_name', $customerNames);
                    } elseif (!empty($customerNames)) {
                        $sub->orWhereIn('customer_name', $customerNames);
                    }
                }),
            'sales_person'
        )->get();

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

        $collection = $paginator->getCollection()->map(function (Customer $customer) use ($ordersRows, $invoicesRows, $quotationRows, $opportunityRows, $matchesCustomer, $extractItemAmount, $extractItemLabel) {
            $matchedOrders = $ordersRows->filter(fn ($row) => $matchesCustomer($row, $customer))->values();
            $matchedInvoices = $invoicesRows->filter(fn ($row) => $matchesCustomer($row, $customer))->values();
            $matchedQuotations = $quotationRows->filter(fn ($row) => $matchesCustomer($row, $customer))->values();
            $matchedOpportunities = $opportunityRows->filter(fn ($row) => $matchesCustomer($row, $customer))->values();

            $ordersCount = $matchedOrders->count();
            $ordersTotal = (float) $matchedOrders->sum(fn ($row) => (float) ($row->total ?? 0));
            $invoicesTotal = (float) $matchedInvoices->sum(fn ($row) => (float) ($row->total ?? 0));

            $totalRevenue = $invoicesTotal > 0 ? $invoicesTotal : $ordersTotal;

            $lastOrderAt = $matchedOrders->max('created_at');
            $lastInvoiceAt = $matchedInvoices->map(fn ($row) => $row->issue_date ?: $row->created_at)->filter()->max();

            $lastActivity = collect([
                $lastOrderAt,
                $lastInvoiceAt,
                $customer->updated_at,
                $customer->created_at,
            ])
                ->filter()
                ->max();

            $lastInvoiceSalesPerson = $matchedInvoices->pluck('sales_person')->filter()->last();
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

            $paidTotal = (float) $matchedInvoices
                ->filter(fn ($row) => strtolower((string) ($row->payment_status ?? '')) === 'paid')
                ->sum(fn ($row) => (float) ($row->total ?? 0));
            $partialTotal = (float) $matchedInvoices
                ->filter(fn ($row) => strtolower((string) ($row->payment_status ?? '')) === 'partial')
                ->sum(fn ($row) => (float) ($row->total ?? 0));
            $unpaidTotal = (float) $matchedInvoices
                ->filter(fn ($row) => strtolower((string) ($row->payment_status ?? '')) === 'unpaid')
                ->sum(fn ($row) => (float) ($row->total ?? 0));
            $paidCount = $matchedInvoices
                ->filter(fn ($row) => strtolower((string) ($row->payment_status ?? '')) === 'paid')
                ->count();
            $partialCount = $matchedInvoices
                ->filter(fn ($row) => strtolower((string) ($row->payment_status ?? '')) === 'partial')
                ->count();
            $unpaidCount = $matchedInvoices
                ->filter(fn ($row) => strtolower((string) ($row->payment_status ?? '')) === 'unpaid')
                ->count();

            $invoicesCount = $matchedInvoices->count();
            $quotationTotal = $matchedQuotations->count();
            $quotationConverted = $matchedQuotations->filter(fn ($row) => in_array(strtolower((string) ($row->status ?? '')), ['converted', 'accepted'], true))->count();
            $quotationPending = $matchedQuotations->filter(fn ($row) => in_array(strtolower((string) ($row->status ?? '')), ['pending', 'sent', 'draft'], true))->count();
            $quotationLost = $matchedQuotations->filter(fn ($row) => in_array(strtolower((string) ($row->status ?? '')), ['lost', 'cancelled', 'canceled'], true))->count();
            $opportunitiesCount = $matchedOpportunities->count();
            $revenueBreakdown = [];

            $rowsForRevenueItems = $matchedInvoices->count() > 0 ? $matchedInvoices : $matchedOrders;
            foreach ($rowsForRevenueItems as $row) {
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
                'joinedDate' => optional($customer->created_at)->toDateString(),
                'totalRevenue' => $totalRevenue,
                'orders' => $ordersCount,
                'lastActivity' => $lastActivity ? $lastActivity->toDateString() : optional($customer->created_at)->toDateString(),
                'salesperson' => $salesperson,
                'invoicePaidTotal' => $paidTotal,
                'invoicePartialTotal' => $partialTotal,
                'invoiceUnpaidTotal' => $unpaidTotal,
                'invoicePaidCount' => $paidCount,
                'invoicePartialCount' => $partialCount,
                'invoiceUnpaidCount' => $unpaidCount,
                'invoicesCount' => $invoicesCount,
                'quotationTotal' => $quotationTotal,
                'quotationConverted' => $quotationConverted,
                'quotationPending' => $quotationPending,
                'quotationLost' => $quotationLost,
                'opportunitiesCount' => $opportunitiesCount,
                'revenueBreakdown' => $revenueBreakdown,
            ];
        });

        $paginator->setCollection($collection);

        return response()->json($paginator);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $tenantId = $this->currentTenantId();
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
            'source' => 'nullable|string|max:100',
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
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $validatedData = $validator->validated();

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
        return Customer::with('customFieldValues.field')->findOrFail($id);
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
            'source' => 'nullable|string|max:100',
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
     * Remove the specified resource from storage.
     */
    public function destroy($id)
    {
        $customer = Customer::findOrFail($id);
        $customer->delete();
        return response()->json(['message' => 'Customer deleted successfully']);
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
