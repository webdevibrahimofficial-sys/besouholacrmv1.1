<?php

namespace App\Http\Controllers;

use App\Models\InventoryRequest;
use App\Models\Lead;
use App\Models\CrmSetting;
use App\Models\User;
use App\Notifications\RequestCreated;
use App\Traits\InventoryDeleteAuthorization;
use App\Traits\ResolvesNotificationRecipients;
use App\Traits\UserHierarchyTrait;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;

class InventoryRequestController extends Controller
{
    use ResolvesNotificationRecipients, UserHierarchyTrait, InventoryDeleteAuthorization;
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = InventoryRequest::latest();

        $roleLower = strtolower($user->role ?? '');
        $isAdminOrManager = $user->is_super_admin || 
                            in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

        if (!$isAdminOrManager) {
            $viewableUserIds = $this->getViewableUserIds($user);
            if ($viewableUserIds !== null) {
                $query->whereIn('meta_data->created_by_id', $viewableUserIds);
            } else {
                $query->where('meta_data->created_by_id', $user->id);
            }
        }

        $paginated = $query->paginate($request->input('per_page', 10));
        $this->appendLeadSourceToRequests($paginated, $user->tenant_id);

        return $paginated;
    }

    /**
     * Store a newly created resource in storage.
     */
    private function appendLeadSourceToRequests($paginated, ?int $tenantId): void
    {
        if (!$paginated || !method_exists($paginated, 'items')) {
            return;
        }

        $items = $paginated->items();
        if (!is_array($items) || empty($items)) {
            return;
        }

        $leadIds = array_values(array_unique(array_filter(array_map(function ($item) {
            if (isset($item->lead_id)) {
                return (int) $item->lead_id;
            }
            if (isset($item->leadId)) {
                return (int) $item->leadId;
            }

            $metaData = $item->meta_data ?? $item->metaData ?? null;
            if (is_string($metaData) && $metaData !== '') {
                $metaData = json_decode($metaData, true) ?: [];
            }
            if (!is_array($metaData)) {
                return null;
            }
            return isset($metaData['lead_id']) ? (int) $metaData['lead_id'] : null;
        }, $items), fn($value) => !empty($value))));

        if (empty($leadIds)) {
            return;
        }

        $leads = Lead::whereIn('id', $leadIds)
            ->when($tenantId, fn($q) => $q->where('tenant_id', $tenantId))
            ->get()
            ->keyBy('id');

        foreach ($items as $item) {
            $itemSource = trim((string) ($item->source ?? ''));
            $sourcePlaceholder = in_array(strtolower($itemSource), ['history_import', 'excel_import', 'imported'], true);
            if ($itemSource !== '' && !$sourcePlaceholder) {
                continue;
            }

            $leadId = null;
            if (isset($item->lead_id)) {
                $leadId = (int) $item->lead_id;
            } elseif (isset($item->leadId)) {
                $leadId = (int) $item->leadId;
            } else {
                $metaData = $item->meta_data ?? $item->metaData ?? null;
                if (is_string($metaData) && $metaData !== '') {
                    $metaData = json_decode($metaData, true) ?: [];
                }
                if (is_array($metaData) && isset($metaData['lead_id'])) {
                    $leadId = (int) $metaData['lead_id'];
                }
            }
            if (!$leadId || !isset($leads[$leadId])) {
                continue;
            }

            $lead = $leads[$leadId];
            if (!empty(trim((string) ($lead->source ?? '')))) {
                $item->source = $lead->source;
            }
        }
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'customer_name' => 'nullable|string|max:255',
            'property_unit' => 'nullable|string|max:255',
            'product' => 'nullable|string|max:255',
            'quantity' => 'nullable|integer',
            'status' => 'nullable|string|max:255',
            'priority' => 'nullable|string|max:255',
            'type' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'assigned_to' => 'nullable|string|max:255',
            'payment_plan' => 'nullable|string|max:255',
            'source' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $validator->validated();

        $crm = CrmSetting::first();
        $requiresApproval = is_array($crm?->settings) ? (bool)($crm->settings['requestApprovals'] ?? false) : false;
        if ($requiresApproval) {
            $data['status'] = 'pending_approval';
        }

        $inventoryRequest = InventoryRequest::create($data);

        if (Auth::check()) {
            /** @var \App\Models\User $user */
            $user = Auth::user();
            $assignee = null;
            if (!empty($inventoryRequest->assigned_to)) {
                $assignee = User::with(['manager', 'team.leader'])->find($inventoryRequest->assigned_to);
            }

            $baseUser = $assignee ?: $user;
            $notification = new RequestCreated($inventoryRequest, $user->name);

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

        return response()->json($inventoryRequest, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(InventoryRequest $inventoryRequest)
    {
        return $inventoryRequest;
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, InventoryRequest $inventoryRequest)
    {
        $validator = Validator::make($request->all(), [
            'customer_name' => 'nullable|string|max:255',
            'property_unit' => 'nullable|string|max:255',
            'product' => 'nullable|string|max:255',
            'quantity' => 'nullable|integer',
            'status' => 'nullable|string|max:255',
            'priority' => 'nullable|string|max:255',
            'type' => 'nullable|string|max:255',
            'description' => 'nullable|string',
            'assigned_to' => 'nullable|string|max:255',
            'payment_plan' => 'nullable|string|max:255',
            'source' => 'nullable|string|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $inventoryRequest->update($request->all());

        return response()->json($inventoryRequest);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, InventoryRequest $inventoryRequest)
    {
        if ($resp = $this->authorizeInventoryDelete($request, 'general')) {
            return $resp;
        }
        $inventoryRequest->delete();

        return response()->noContent();
    }
}
