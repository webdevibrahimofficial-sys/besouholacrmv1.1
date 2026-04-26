<?php

namespace App\Http\Controllers;

use App\Models\RealEstateRequest;
use App\Models\CcCustomer;
use App\Models\CrmSetting;
use App\Models\Lead;
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
