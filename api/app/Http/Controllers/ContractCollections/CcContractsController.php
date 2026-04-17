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
        $status = $request->query('status');

        $query = CcContract::query()
            ->where('tenant_id', $tenantId)
            ->with(['customer', 'property']);

        if ($status) {
            $query->where('status', $status);
        }
        if ($q !== '') {
            $query->where(function ($sub) use ($q) {
                $sub->where('contract_number', 'like', "%{$q}%")
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%{$q}%")->orWhere('phone', 'like', "%{$q}%"));
            });
        }

        return response()->json($query->orderByDesc('id')->paginate(25));
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

