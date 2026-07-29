<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcContract;
use App\Models\CcAttachment;
use App\Models\ContractTemplate;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Services\ContractCollectionsService;
use Illuminate\Http\Request;

class CcContractsController extends BaseCcController
{
    public function __construct(protected ContractCollectionsService $service)
    {
    }

    public function index(Request $request)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $tenantId = $this->tenantId($request);
        $q = trim((string) $request->query('q', ''));
        $contractNumber = trim((string) $request->query('contract_number', ''));
        $customerId = $request->query('customer_id');
        $unitCode = trim((string) $request->query('unit_code', ''));
        $projectId = $request->query('project_id');
        $salesOwnerId = $request->query('sales_owner_id');
        $contractDateFrom = $request->query('contract_date_from');
        $contractDateTo = $request->query('contract_date_to');
        $status = $request->query('status');

        $query = CcContract::query()
            ->where('tenant_id', $tenantId)
            ->with([
                'customer',
                'customer.project:id,name',
                'customer.salesOwner:id,name',
                'property',
            ]);

        if ($status) {
            $query->where('status', $status);
        }
        if ($contractNumber !== '') {
            $query->where('contract_number', 'like', "%{$contractNumber}%");
        }
        if ($customerId) {
            $query->where('customer_id', $customerId);
        }
        if ($unitCode !== '') {
            $query->whereHas('property', fn ($p) => $p->where('unit_code', 'like', "%{$unitCode}%"));
        }
        if ($projectId) {
            $query->whereHas('customer', fn ($c) => $c->where('project_id', $projectId));
        }
        if ($salesOwnerId) {
            $query->whereHas('customer', fn ($c) => $c->where('sales_owner_id', $salesOwnerId));
        }
        if ($contractDateFrom) {
            $query->whereDate('contract_date', '>=', $contractDateFrom);
        }
        if ($contractDateTo) {
            $query->whereDate('contract_date', '<=', $contractDateTo);
        }
        if ($q !== '') {
            $query->where(function ($sub) use ($q) {
                $sub->where('contract_number', 'like', "%{$q}%")
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$q}%")->orWhere('phone', 'like', "%{$q}%"))
                    ->orWhereHas('property', fn ($p) => $p->where('unit_code', 'like', "%{$q}%"));
            });
        }

        $perPage = (int) $request->query('per_page', 25);
        if ($perPage <= 0) {
            $perPage = 25;
        }
        if ($perPage > 200) {
            $perPage = 200;
        }

        return response()->json($query->orderByDesc('id')->paginate($perPage));
    }

    public function store(Request $request)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $data = $request->validate([
            'customer_id' => 'required|integer|exists:cc_customers,id',
            'property_id' => 'required|integer|exists:properties,id',
            'customer_unit_id' => 'nullable|integer|exists:cc_customer_units,id',
            'contract_number' => 'nullable|string|max:255',
            'contract_date' => 'nullable|date',
            'first_due_date' => 'nullable|date',
            'total_price' => 'nullable|numeric|min:0',
        ]);

        $contract = $this->service->createContract($data, $request->user());

        return response()->json($contract, 201);
    }

    public function show(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $tenantId = $this->tenantId($request);
        $contract = CcContract::where('tenant_id', $tenantId)
            ->with(['customer', 'property', 'installments', 'payments.allocations'])
            ->findOrFail($id);

        $totalPaid = (float) $contract->payments->where('status', 'posted')->sum('amount');
        $outstanding = (float) $contract->total_price - $totalPaid;

        return response()->json([
            'contract' => $contract,
            'totals' => [
                'total_paid' => $totalPaid,
                'outstanding_balance' => $outstanding,
            ],
        ]);
    }

    public function setTemplate(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $tenantId = $this->tenantId($request);
        $contract = CcContract::where('tenant_id', $tenantId)->findOrFail($id);

        $validated = $request->validate([
            'template_id' => ['nullable', 'integer'],
        ]);

        $templateId = (int) ($validated['template_id'] ?? 0);
        if ($templateId <= 0) {
            $meta = is_array($contract->meta_data) ? $contract->meta_data : [];
            unset($meta['contract_template_id']);
            $contract->meta_data = $meta;
            $contract->save();

            return response()->json([
                'ok' => true,
                'template_id' => null,
                'contract' => $contract->fresh(),
            ]);
        }

        $tpl = ContractTemplate::query()
            ->where('tenant_id', $tenantId)
            ->where('id', $templateId)
            ->where('status', 'Active')
            ->where('content_type', 'html')
            ->first();

        if (!$tpl) {
            return response()->json([
                'message' => 'Template not available.',
            ], 422);
        }

        $meta = is_array($contract->meta_data) ? $contract->meta_data : [];
        $meta['contract_template_id'] = $tpl->id;
        $contract->meta_data = $meta;
        $contract->save();

        return response()->json([
            'ok' => true,
            'template_id' => $tpl->id,
            'contract' => $contract->fresh(),
        ]);
    }

    public function updatePaymentPlan(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $tenantId = $this->tenantId($request);
        $contract = CcContract::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'reservation_amount' => 'nullable|numeric|min:0',
            'down_payment' => 'nullable|numeric|min:0',
            'delivery_payment' => 'nullable|numeric|min:0',
            'installment_type' => 'nullable|string|in:monthly,quarterly,half-yearly,yearly,half_yearly,halfyearly,annual,annually',
            'installment_count' => 'nullable|integer|min:0',
            'installment_value' => 'nullable|numeric|min:0',
            'first_due_date' => 'nullable|date',
        ]);

        DB::transaction(function () use ($contract, $data) {
            $snapshot = is_array($contract->payment_plan_snapshot) ? $contract->payment_plan_snapshot : [];

            if (array_key_exists('reservation_amount', $data)) $snapshot['reservation_amount'] = (float) $data['reservation_amount'];
            if (array_key_exists('down_payment', $data)) $snapshot['down_payment'] = (float) $data['down_payment'];
            if (array_key_exists('delivery_payment', $data)) $snapshot['delivery_payment'] = (float) $data['delivery_payment'];
            if (array_key_exists('installment_type', $data)) $snapshot['installment_type'] = $data['installment_type'];
            if (array_key_exists('installment_count', $data)) $snapshot['installment_count'] = (int) $data['installment_count'];
            if (array_key_exists('installment_value', $data)) $snapshot['installment_value'] = (float) $data['installment_value'];

            $contract->payment_plan_snapshot = $snapshot;
            if (!empty($data['first_due_date'])) {
                $contract->first_due_date = $data['first_due_date'];
            }
            $contract->save();

            $this->service->generateInstallments($contract);
        });

        $contract = CcContract::where('tenant_id', $tenantId)
            ->with(['customer', 'property', 'installments', 'payments.allocations'])
            ->findOrFail($id);

        $totalPaid = (float) $contract->payments->where('status', 'posted')->sum('amount');
        $outstanding = (float) $contract->total_price - $totalPaid;

        return response()->json([
            'contract' => $contract,
            'totals' => [
                'total_paid' => $totalPaid,
                'outstanding_balance' => $outstanding,
            ],
        ]);
    }

    public function destroy(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $tenantId = $this->tenantId($request);
        $action = strtolower(trim((string) $request->query('action', 'delete')));
        if (!in_array($action, ['delete', 'cancel'], true)) {
            $action = 'delete';
        }

        $contract = CcContract::where('tenant_id', $tenantId)
            ->with(['customer', 'property', 'customerUnit', 'payments'])
            ->findOrFail($id);

        $hasPayments = (bool) $contract->payments()
            ->where('status', 'posted')
            ->where('amount', '>', 0)
            ->exists();

        if ($action === 'delete' && $hasPayments) {
            return response()->json([
                'message' => 'Contract has posted payments and cannot be deleted. Cancel it instead.',
            ], 422);
        }

        DB::transaction(function () use ($contract, $request, $action, $tenantId) {
            if ($action === 'cancel') {
                $contract->status = 'cancelled';
                $contract->save();
            } else {
                CcAttachment::where('tenant_id', $tenantId)
                    ->where('related_type', 'contract')
                    ->where('related_id', $contract->id)
                    ->delete();
                $contract->delete();
            }

            $customerUnit = $contract->customerUnit;
            if ($customerUnit) {
                $customerUnit->status = 'reserved';
                if (Schema::hasColumn($customerUnit->getTable(), 'contracted_at')) {
                    $customerUnit->contracted_at = null;
                }
                if (Schema::hasColumn($customerUnit->getTable(), 'reserved_at') && !$customerUnit->reserved_at) {
                    $customerUnit->reserved_at = now();
                }
                $customerUnit->save();
            }

            $property = $contract->property;
            if ($property) {
                $property->status = 'Reserved';
                if (Schema::hasColumn($property->getTable(), 'sold_at')) $property->sold_at = null;
                if (Schema::hasColumn($property->getTable(), 'sold_lead_id')) $property->sold_lead_id = null;
                if (Schema::hasColumn($property->getTable(), 'reserved_at') && !$property->reserved_at) $property->reserved_at = now();
                if (Schema::hasColumn($property->getTable(), 'reserved_expires_at')) $property->reserved_expires_at = null;
                if (Schema::hasColumn($property->getTable(), 'reserved_lead_id')) {
                    $leadId = $contract->customer?->lead_id;
                    $property->reserved_lead_id = $leadId ? (int) $leadId : null;
                }
                $property->save();
            }

            try {
                activity('contract_collections')
                    ->causedBy($request->user())
                    ->performedOn($property ?: $contract)
                    ->withProperties([
                        'action' => $action === 'cancel' ? 'contract_cancelled' : 'contract_deleted',
                        'contract_id' => $contract->id,
                        'property_id' => $contract->property_id,
                    ])
                    ->log('cc_contract_removed');
            } catch (\Throwable $e) {
            }
        });

        return response()->json([
            'ok' => true,
            'action' => $action,
        ]);
    }
}
