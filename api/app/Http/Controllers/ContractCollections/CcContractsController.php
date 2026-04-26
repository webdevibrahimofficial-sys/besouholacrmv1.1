<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcContract;
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
}
