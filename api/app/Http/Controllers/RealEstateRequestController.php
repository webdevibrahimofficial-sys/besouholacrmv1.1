<?php

namespace App\Http\Controllers;

use App\Models\RealEstateRequest;
use App\Models\CcCustomer;
use App\Models\CcCustomerUnit;
use App\Models\CcPaymentPlanVersion;
use App\Models\CrmSetting;
use App\Models\Lead;
use App\Models\Property;
use App\Models\User;
use App\Notifications\RequestCreated;
use App\Traits\InventoryDeleteAuthorization;
use App\Traits\ResolvesNotificationRecipients;
use App\Traits\UserHierarchyTrait;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;

class RealEstateRequestController extends Controller
{
    use ResolvesNotificationRecipients, UserHierarchyTrait, InventoryDeleteAuthorization;
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = RealEstateRequest::latest();

        $roleLower = strtolower($user->role ?? '');
        $isAdminOrManager = $user->is_super_admin || 
                            in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

        if (!$isAdminOrManager) {
            // Some deployments may not have `meta_data` on this table (older DB schema).
            // Avoid throwing SQL errors by only using JSON queries when the column exists.
            if (Schema::hasColumn('real_estate_requests', 'meta_data')) {
                $viewableUserIds = $this->getViewableUserIds($user);
                if ($viewableUserIds !== null) {
                    $query->whereIn('meta_data->created_by_id', $viewableUserIds);
                } else {
                    $query->where('meta_data->created_by_id', $user->id);
                }
            }
        }

        return $query->paginate($request->input('per_page', 10));
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'customer_name' => 'nullable|string|max:255',
            'project' => 'nullable|string|max:255',
            'unit' => 'nullable|string|max:255',
            'amount' => 'nullable|numeric',
            'status' => 'nullable|string|max:255',
            'type' => 'nullable|string|max:255',
            'date' => 'nullable|date',
            'notes' => 'nullable|string',
            'phone' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $request->all();

        $crm = CrmSetting::first();
        $requiresApproval = is_array($crm?->settings) ? (bool)($crm->settings['requestApprovals'] ?? false) : false;
        if ($requiresApproval) {
            $data['status'] = 'pending_approval';
        }

        $realEstateRequest = RealEstateRequest::create($data);

        if (Auth::check()) {
            /** @var \App\Models\User $user */
            $user = Auth::user();
            $assignee = null;
            if (!empty($realEstateRequest->assigned_to)) {
                $assignee = User::with(['manager', 'team.leader'])->find($realEstateRequest->assigned_to);
            }

            $baseUser = $assignee ?: $user;
            $notification = new RequestCreated($realEstateRequest, $user->name);

            $recipients = $this->buildNotificationRecipients(
                $baseUser,
                [
                    'owner' => $user,
                    'assignee' => $assignee,
                    'assigner' => $user,
                ],
                'leads',
                'notify_requests'
            );

            foreach ($recipients as $recipient) {
                try {
                    $recipient->notify($notification);
                } catch (\Throwable $e) {
                }
            }
        }

        return response()->json($realEstateRequest, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(RealEstateRequest $realEstateRequest)
    {
        return $realEstateRequest;
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, RealEstateRequest $realEstateRequest)
    {
        $validator = Validator::make($request->all(), [
            'customer_name' => 'nullable|string|max:255',
            'project' => 'nullable|string|max:255',
            'unit' => 'nullable|string|max:255',
            'amount' => 'nullable|numeric',
            'status' => 'nullable|string|max:255',
            'type' => 'nullable|string|max:255',
            'date' => 'nullable|date',
            'notes' => 'nullable|string',
            'phone' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $realEstateRequest->update($request->all());

        return response()->json($realEstateRequest);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, RealEstateRequest $realEstateRequest)
    {
        if ($resp = $this->authorizeInventoryDelete($request, 'realestate')) {
            return $resp;
        }
        $realEstateRequest->delete();

        return response()->noContent();
    }

    public function convertToDeal(Request $request, RealEstateRequest $realEstateRequest)
    {
        try {
            $user = $request->user();
            if (!$user) {
                return response()->json(['message' => 'Unauthorized'], 401);
            }

            $companyType = $this->normalizeTenantCompanyType();
            if ($companyType === 'general') {
                return response()->json(['message' => 'This action is not available for this tenant type'], 403);
            }

            $tenantId = (int) ($user->tenant_id ?? 0);
            if ($tenantId <= 0 || (int) ($realEstateRequest->tenant_id ?? 0) !== $tenantId) {
                return response()->json(['message' => 'Not found'], 404);
            }

            $roleLower = strtolower(trim((string) ($user->role ?? $user->job_title ?? '')));
            $isAdminOrDirector = $this->isTenantAdminUser($user) || ($user->is_super_admin ?? false) || str_contains($roleLower, 'director');
            $inventoryPerms = $this->getInventoryModulePerms($user);
            $canManageRequests = $isAdminOrDirector || in_array('showRequests', $inventoryPerms, true);

            if (!$canManageRequests) {
                return response()->json(['message' => 'Unauthorized'], 403);
            }

            $status = trim((string) ($realEstateRequest->status ?? ''));
            if ($status !== '' && strcasecmp($status, 'Approved') !== 0 && strcasecmp($status, 'Converted') !== 0) {
                return response()->json(['message' => 'Request must be approved before converting'], 422);
            }

            $hasRequestMetaColumn = Schema::hasColumn('real_estate_requests', 'meta_data');
            $meta = [];
            if ($hasRequestMetaColumn) {
                if (is_array($realEstateRequest->meta_data)) {
                    $meta = $realEstateRequest->meta_data;
                } elseif (is_string($realEstateRequest->meta_data)) {
                    $decoded = json_decode($realEstateRequest->meta_data, true);
                    $meta = is_array($decoded) ? $decoded : [];
                }
            }

            $leadId = $meta['lead_id'] ?? null;
            $lead = null;
            if ($leadId) {
                $lead = Lead::withTrashed()->where('tenant_id', $tenantId)->find($leadId);
            }

            // Ensure there is a Lead (Deal) representing this request.
            if (!$lead) {
                $leadName = trim((string) ($realEstateRequest->customer_name ?? ''));
                $leadPhone = trim((string) ($realEstateRequest->phone ?? ''));
                $leadEmail = '';
                $leadSource = trim((string) ($realEstateRequest->source ?? 'Real Estate Request'));
                $note = trim((string) ($realEstateRequest->notes ?? ''));

                if ($leadName !== '' || $leadPhone !== '') {
                    try {
                        $lead = Lead::create([
                            'tenant_id' => $tenantId,
                            'name' => $leadName !== '' ? $leadName : ($leadPhone !== '' ? $leadPhone : 'Real Estate Request'),
                            'phone' => $leadPhone !== '' ? $leadPhone : null,
                            'email' => $leadEmail !== '' ? $leadEmail : null,
                            'source' => $leadSource !== '' ? $leadSource : null,
                            'project' => $realEstateRequest->project,
                            'unit' => $realEstateRequest->unit,
                            'estimated_value' => $realEstateRequest->amount ?? null,
                            'notes' => trim('Converted from Real Estate Request #' . $realEstateRequest->id . ($note ? (': ' . $note) : '')),
                            'created_by' => (int) $user->id,
                        ]);
                    } catch (\Throwable $e) {
                        Log::warning('RealEstateRequest convertToDeal: lead create failed', [
                            'request_id' => $realEstateRequest->id ?? null,
                            'tenant_id' => $tenantId,
                            'exception' => $e->getMessage(),
                        ]);
                        $lead = null;
                    }

                    if ($hasRequestMetaColumn && $lead) {
                        $meta['lead_id'] = $lead->id;
                    }
                }
            }

            // Optional: create/update Contract Collection customer when that module is available.
            $existingCustomer = null;
            $hasCcCustomersTable = Schema::hasTable('cc_customers');
            if ($hasCcCustomersTable) {
                if ($lead) {
                    $existingCustomer = CcCustomer::where('tenant_id', $tenantId)->where('lead_id', $lead->id)->first();
                }

                if (!$existingCustomer && isset($meta['cc_customer_id'])) {
                    $existingCustomer = CcCustomer::where('tenant_id', $tenantId)->find((int) $meta['cc_customer_id']);
                }

                if (!$existingCustomer) {
                    $name = trim((string) ($lead?->name ?? $realEstateRequest->customer_name ?? ''));
                    if ($name === '') {
                        return response()->json(['message' => 'Customer name is required'], 422);
                    }

                    $phone = trim((string) ($lead?->phone ?? $realEstateRequest->phone ?? ''));
                    $email = trim((string) ($lead?->email ?? ''));
                    $source = trim((string) ($lead?->source ?? $realEstateRequest->source ?? ''));
                    $projectId = $lead?->project_id ? (int) $lead->project_id : null;
                    $salesOwnerId = $lead?->assigned_to ? (int) $lead->assigned_to : null;

                    $note = trim((string) ($realEstateRequest->notes ?? ''));
                    $lastComments = trim('Converted from Real Estate Request #' . $realEstateRequest->id . ($note ? (': ' . $note) : ''));

                    try {
                        $existingCustomer = CcCustomer::create([
                            'tenant_id' => $tenantId,
                            'lead_id' => $lead?->id,
                            'project_id' => $projectId,
                            'sales_owner_id' => $salesOwnerId,
                            'name' => $name,
                            'phone' => $phone !== '' ? $phone : null,
                            'email' => $email !== '' ? $email : null,
                            'source' => $source !== '' ? $source : null,
                            'last_comments' => $lastComments !== '' ? $lastComments : null,
                            'meta_data' => [
                                'created_from' => 'real_estate_request',
                                'real_estate_request_id' => $realEstateRequest->id,
                            ],
                        ]);
                    } catch (\Throwable $e) {
                        Log::warning('RealEstateRequest convertToDeal: cc_customer create failed', [
                            'request_id' => $realEstateRequest->id ?? null,
                            'tenant_id' => $tenantId,
                            'exception' => $e->getMessage(),
                        ]);
                        $existingCustomer = null;
                    }
                }

                if ($hasRequestMetaColumn && $existingCustomer) {
                    $meta['cc_customer_id'] = $existingCustomer->id;
                }
            }

            // Link request unit to CC customer so it appears in CC Customers table/preview.
            if ($existingCustomer && Schema::hasTable('cc_customer_units')) {
                $propertyId = null;

                if (isset($meta['property_id'])) {
                    $maybeId = (int) $meta['property_id'];
                    $propertyId = $maybeId > 0 ? $maybeId : null;
                }

                if (!$propertyId) {
                    $unitCode = trim((string) ($realEstateRequest->unit ?? ''));
                    if ($unitCode !== '') {
                        $propertyId = Property::where('tenant_id', $tenantId)
                            ->where(function ($q) use ($unitCode) {
                                $q->where('unit_code', $unitCode)
                                    ->orWhere('unit_number', $unitCode)
                                    ->orWhere('name', $unitCode)
                                    ->orWhere('title', $unitCode);
                            })
                            ->value('id');
                    }
                }

                if ($propertyId) {
                    try {
                        $unit = CcCustomerUnit::firstOrCreate(
                            [
                                'tenant_id' => $tenantId,
                                'customer_id' => $existingCustomer->id,
                                'property_id' => (int) $propertyId,
                            ],
                            [
                                'status' => 'reserved',
                                'reserved_at' => now(),
                                'meta_data' => [
                                    'created_from' => 'real_estate_request',
                                    'real_estate_request_id' => (int) $realEstateRequest->id,
                                ],
                            ]
                        );

                        $custMeta = is_array($existingCustomer->meta_data) ? $existingCustomer->meta_data : [];
                        if (!isset($custMeta['primary_customer_unit_id']) || (int) $custMeta['primary_customer_unit_id'] <= 0) {
                            $custMeta['primary_customer_unit_id'] = (int) $unit->id;
                            $existingCustomer->meta_data = $custMeta;
                            $existingCustomer->save();
                        }

                        if ($hasRequestMetaColumn) {
                            $meta['property_id'] = (int) $propertyId;
                            $meta['cc_customer_unit_id'] = (int) $unit->id;
                        }

                        // If the property has installment plans, seed an initial active payment plan version for this CC unit.
                        if (Schema::hasTable('cc_payment_plan_versions')) {
                            $hasActive = CcPaymentPlanVersion::where('tenant_id', $tenantId)
                                ->where('customer_unit_id', $unit->id)
                                ->where('is_active', true)
                                ->exists();

                            if (!$hasActive) {
                                $property = Property::where('tenant_id', $tenantId)->find($propertyId);

                                $leadMeta = is_array($lead?->meta_data) ? $lead->meta_data : [];
                                $leadPlan = isset($leadMeta['payment_plan']) && is_array($leadMeta['payment_plan']) ? $leadMeta['payment_plan'] : null;

                                $leadUnitNo = $leadPlan ? trim((string) ($leadPlan['unitNo'] ?? $leadPlan['unit_no'] ?? '')) : '';
                                $reqUnitNo = trim((string) ($realEstateRequest->unit ?? ''));
                                $propUnitNo = trim((string) ($property?->unit_code ?? $property?->unit_number ?? $property?->name ?? $property?->title ?? ''));

                                $useLeadPlan = $leadPlan
                                    && $leadUnitNo !== ''
                                    && (
                                        ($reqUnitNo !== '' && strcasecmp($leadUnitNo, $reqUnitNo) === 0)
                                        || ($propUnitNo !== '' && strcasecmp($leadUnitNo, $propUnitNo) === 0)
                                    );

                                if ($useLeadPlan) {
                                    $baseAmount = (float) ($leadPlan['totalAmount'] ?? $leadPlan['total_amount'] ?? $leadPlan['netAmount'] ?? $leadPlan['net_amount'] ?? 0);
                                    $downPayment = (float) ($leadPlan['downPayment'] ?? $leadPlan['down_payment'] ?? 0);
                                    $delivery = (float) ($leadPlan['receiptAmount'] ?? $leadPlan['receipt_amount'] ?? 0);
                                    $installmentValue = (float) ($leadPlan['installmentAmount'] ?? $leadPlan['installment_amount'] ?? 0);
                                    $installmentCount = (int) ($leadPlan['noOfMonths'] ?? $leadPlan['no_of_months'] ?? $leadPlan['months'] ?? 0);
                                    $additionalPayments = (float) ($leadPlan['extraInstallments'] ?? $leadPlan['extra_installments'] ?? 0);

                                    CcPaymentPlanVersion::create([
                                        'tenant_id' => $tenantId,
                                        'customer_unit_id' => $unit->id,
                                        'version' => 1,
                                        'is_active' => true,
                                        'reservation_amount' => (float) ($property?->reservation_amount ?? 0),
                                        'down_payment' => $downPayment,
                                        'delivery_payment' => $delivery,
                                        'installment_type' => 'monthly',
                                        'installment_count' => $installmentCount > 0 ? $installmentCount : 0,
                                        'installment_value' => $installmentValue,
                                        'meta_data' => [
                                            'created_from' => 'lead_payment_plan',
                                            'real_estate_request_id' => (int) $realEstateRequest->id,
                                            'lead_id' => (int) ($lead?->id ?? 0),
                                            'lead_payment_plan' => $leadPlan,
                                            'base_price' => $baseAmount,
                                            'additional_payments' => $additionalPayments,
                                            'garage_amount' => $leadPlan['garageAmount'] ?? $leadPlan['garage_amount'] ?? null,
                                            'maintenance' => $leadPlan['maintenanceAmount'] ?? $leadPlan['maintenance_amount'] ?? null,
                                            'net_amount' => $leadPlan['netAmount'] ?? $leadPlan['net_amount'] ?? null,
                                        ],
                                    ]);
                                } else {
                                    $plans = is_array($property?->installment_plans) ? $property->installment_plans : [];
                                    $firstPlan = is_array($plans) ? ($plans[0] ?? null) : null;

                                    if (is_array($firstPlan) && !empty($firstPlan)) {
                                        $basePrice = (float) ($property?->total_after_discount ?? $property?->net_amount ?? $property?->total_price ?? $property?->price ?? 0);
                                        $dpType = strtolower(trim((string) ($firstPlan['downPaymentType'] ?? $firstPlan['down_payment_type'] ?? '')));
                                        $dpRaw = (float) ($firstPlan['downPayment'] ?? $firstPlan['down_payment'] ?? 0);
                                        $downPayment = ($dpType === 'percentage' || $dpType === 'percent') ? ($basePrice * ($dpRaw / 100.0)) : $dpRaw;

                                        $years = (int) ($firstPlan['years'] ?? 0);
                                        $installmentCount = $years > 0 ? ($years * 12) : (int) ($firstPlan['installmentCount'] ?? $firstPlan['installment_count'] ?? 0);
                                        $installmentValue = (float) ($firstPlan['installmentAmount'] ?? $firstPlan['installment_amount'] ?? $firstPlan['installment_value'] ?? 0);

                                        CcPaymentPlanVersion::create([
                                            'tenant_id' => $tenantId,
                                            'customer_unit_id' => $unit->id,
                                            'version' => 1,
                                            'is_active' => true,
                                            'reservation_amount' => (float) ($firstPlan['reservationAmount'] ?? $firstPlan['reservation_amount'] ?? $property?->reservation_amount ?? 0),
                                            'down_payment' => $downPayment,
                                            'delivery_payment' => (float) ($firstPlan['receiptAmount'] ?? $firstPlan['receipt_amount'] ?? $firstPlan['delivery_payment'] ?? 0),
                                            'installment_type' => $firstPlan['installmentType'] ?? $firstPlan['installment_type'] ?? 'monthly',
                                            'installment_count' => $installmentCount > 0 ? $installmentCount : 0,
                                            'installment_value' => $installmentValue,
                                            'meta_data' => [
                                                'created_from' => 'real_estate_request',
                                                'real_estate_request_id' => (int) $realEstateRequest->id,
                                                'property_installment_plan' => $firstPlan,
                                                'base_price' => $basePrice,
                                                'years' => $years > 0 ? $years : null,
                                                'additional_payments' => $firstPlan['extraPayment'] ?? $firstPlan['extra_payment'] ?? null,
                                                'delivery_date' => $firstPlan['deliveryDate'] ?? $firstPlan['delivery_date'] ?? null,
                                            ],
                                        ]);
                                    }
                                }
                            }
                        }
                    } catch (\Throwable $e) {
                        Log::warning('RealEstateRequest convertToDeal: cc_customer_unit create failed', [
                            'request_id' => $realEstateRequest->id ?? null,
                            'tenant_id' => $tenantId,
                            'cc_customer_id' => $existingCustomer->id ?? null,
                            'property_id' => $propertyId,
                            'exception' => $e->getMessage(),
                        ]);
                    }
                }
            }

            $convertedAt = now()->toIso8601String();
            if ($hasRequestMetaColumn) {
                $meta['converted_at'] = $convertedAt;
                $meta['converted_by_id'] = (int) $user->id;
                $meta['converted_by_name'] = (string) ($user->name ?? '');
            } else {
                $existingNotes = trim((string) ($realEstateRequest->notes ?? ''));
                $suffix = trim('Converted at ' . $convertedAt . ' by ' . (string) ($user->name ?? ''));
                $realEstateRequest->notes = $existingNotes ? ($existingNotes . "\n" . $suffix) : $suffix;
            }

            $realEstateRequest->status = 'Converted';
            if ($hasRequestMetaColumn) {
                $realEstateRequest->meta_data = $meta;
            }
            $realEstateRequest->save();

            return response()->json([
                'request' => $realEstateRequest->fresh(),
                'lead' => $lead,
                'cc_customer' => $existingCustomer,
            ]);
        } catch (\Throwable $e) {
            Log::error('RealEstateRequest convertToDeal failed', [
                'request_id' => $realEstateRequest->id ?? null,
                'tenant_id' => $realEstateRequest->tenant_id ?? null,
                'user_id' => $request->user()?->id,
                'exception' => $e->getMessage(),
            ]);

            $message = config('app.debug') ? $e->getMessage() : 'Failed converting request to deal';
            return response()->json(['message' => $message], 500);
        }
    }
}
