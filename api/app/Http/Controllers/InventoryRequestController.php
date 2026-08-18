<?php

namespace App\Http\Controllers;

use App\Models\InventoryRequest;
use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\CrmSetting;
use App\Models\User;
use App\Notifications\RequestCreated;
use App\Services\GeneralInventory\GeneralInventoryApprovalService;
use App\Services\GeneralInventory\GeneralInventoryDecisionService;
use App\Services\ItemStockService;
use App\Traits\InventoryDeleteAuthorization;
use App\Traits\ResolvesNotificationRecipients;
use App\Traits\UserHierarchyTrait;
use Illuminate\Http\Request;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

class InventoryRequestController extends Controller
{
    use ResolvesNotificationRecipients, UserHierarchyTrait, InventoryDeleteAuthorization;

    public function __construct(
        private readonly GeneralInventoryApprovalService $approvals,
        private readonly GeneralInventoryDecisionService $decisions,
    ) {
    }
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
        $this->appendReservationActionTotalsToRequests($paginated, $user->tenant_id);

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

    private function appendReservationActionTotalsToRequests($paginated, ?int $tenantId): void
    {
        if (!$paginated || !method_exists($paginated, 'items')) {
            return;
        }

        $items = $paginated->items();
        if (!is_array($items) || empty($items)) {
            return;
        }

        $actionIds = [];
        foreach ($items as $item) {
            $meta = $item->meta_data ?? $item->metaData ?? null;
            if (is_string($meta) && $meta !== '') {
                $meta = json_decode($meta, true) ?: [];
            }
            if (!is_array($meta)) {
                continue;
            }
            if (!empty($meta['source_action_id'])) {
                $actionIds[] = (int) $meta['source_action_id'];
            }
        }

        $actionIds = array_values(array_unique(array_filter($actionIds)));
        if (empty($actionIds)) {
            return;
        }

        $actions = LeadAction::query()
            ->whereIn('id', $actionIds)
            ->when($tenantId, fn($q) => $q->where('tenant_id', $tenantId))
            ->get()
            ->keyBy('id');

        foreach ($items as $item) {
            $meta = $item->meta_data ?? $item->metaData ?? null;
            if (is_string($meta) && $meta !== '') {
                $meta = json_decode($meta, true) ?: [];
            }
            if (!is_array($meta) || empty($meta['source_action_id'])) {
                continue;
            }

            $action = $actions[(int) $meta['source_action_id']] ?? null;
            $details = is_array($action?->details ?? null) ? $action->details : [];
            $rows = is_array($details['reservationGeneralItems'] ?? null) ? $details['reservationGeneralItems'] : [];
            if (empty($rows)) {
                continue;
            }

            $hasLineIndex = array_key_exists('source_action_line', $meta);
            $lineIndex = $hasLineIndex ? (int) $meta['source_action_line'] : null;
            if ($hasLineIndex && array_key_exists($lineIndex, $rows) && is_array($rows[$lineIndex])) {
                $row = $rows[$lineIndex];
                $lineTotal = $this->resolveReservationLineTotal($row);
                $meta['reservationGeneralItems'] = [$row];
                $meta['reservationAmount'] = $lineTotal;
                $meta['line_total'] = $lineTotal;
                $meta['total'] = $lineTotal;
                $meta['addons_total'] = (float) ($row['addons_total'] ?? 0);
                $meta['discount_amount'] = (float) ($row['discount_amount'] ?? 0);
                $item->meta_data = $meta;
                continue;
            }

            $meta['reservationGeneralItems'] = $rows;
            $meta['reservationAmount'] = $this->resolveReservationRowsTotal($rows);
            $meta['line_total'] = $meta['reservationAmount'];
            $meta['total'] = $meta['reservationAmount'];
            $meta['addons_total'] = (float) collect($rows)->sum(fn ($row) => (float) ($row['addons_total'] ?? 0));
            $meta['discount_amount'] = (float) collect($rows)->sum(fn ($row) => (float) ($row['discount_amount'] ?? 0));
            $item->meta_data = $meta;
        }
    }

    private function resolveReservationLineTotal(array $row): float
    {
        foreach (['line_total', 'total', 'sub_total', 'subtotal'] as $key) {
            if (array_key_exists($key, $row) && $row[$key] !== null && $row[$key] !== '') {
                return (float) $row[$key];
            }
        }

        $quantity = (float) ($row['quantity'] ?? 1);
        $price = (float) ($row['price'] ?? 0);
        $addonsTotal = (float) ($row['addons_total'] ?? 0);
        $discountAmount = (float) ($row['discount_amount'] ?? 0);

        return max(0, ($quantity * $price) + $addonsTotal - $discountAmount);
    }

    /**
     * @param  list<array<string,mixed>>  $rows
     */
    private function resolveReservationRowsTotal(array $rows): float
    {
        return (float) collect($rows)
            ->filter(fn ($row) => is_array($row))
            ->sum(fn (array $row) => $this->resolveReservationLineTotal($row));
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
            'rejection_reason' => 'nullable|string',
            'change_request_reason' => 'nullable|string',
            'meta_data' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        try {
            $prepared = $this->approvals->prepareUpdate($inventoryRequest, $request->all(), $request->user());
        } catch (AuthorizationException $e) {
            return response()->json(['message' => $e->getMessage()], 403);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => collect($e->errors())->flatten()->first() ?: 'Inventory request validation failed.',
                'errors' => $e->errors(),
            ], 422);
        }

        $previousStatus = $prepared['previous_status'];
        $updateData = Arr::only($prepared['data'], [
            'customer_name',
            'property_unit',
            'product',
            'quantity',
            'status',
            'priority',
            'type',
            'description',
            'assigned_to',
            'payment_plan',
            'source',
            'meta_data',
        ]);
        $inventoryRequest->fill($updateData);
        $inventoryRequest->save();

        $nextStatus = $prepared['next_status'];
        $stock = app(ItemStockService::class);
        if ($this->decisions->isRejectedLike($nextStatus) && ! $this->decisions->isRejectedLike($previousStatus)) {
            $stock->releaseRequest($inventoryRequest, 'rejected');
        }
        if ($this->decisions->isConvertedLike($nextStatus) && ! $this->decisions->isConvertedLike($previousStatus)) {
            $stock->freezeRequest($inventoryRequest);
        }

        return response()->json([
            'data' => $inventoryRequest->fresh(),
            'decision' => $prepared['decision'],
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, InventoryRequest $inventoryRequest)
    {
        if ($resp = $this->authorizeInventoryDelete($request, 'general')) {
            return $resp;
        }
        app(ItemStockService::class)->releaseRequest($inventoryRequest, 'deleted');
        $inventoryRequest->delete();

        return response()->noContent();
    }
}
