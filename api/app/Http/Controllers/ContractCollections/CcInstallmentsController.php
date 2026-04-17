<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcInstallment;
use App\Services\ContractCollectionsService;
use Illuminate\Http\Request;

class CcInstallmentsController extends BaseCcController
{
    public function __construct(protected ContractCollectionsService $service)
    {
    }

    public function index(Request $request)
    {
        $this->requireCcPermission($request, 'viewInstallments');

        $tenantId = $this->tenantId($request);
        $status = $request->query('status');
        $customerId = $request->query('customer_id');
        $projectId = $request->query('project_id');
        $paymentMethod = $request->query('payment_method');
        $overdueOnly = filter_var($request->query('overdue_only', false), FILTER_VALIDATE_BOOLEAN);
        $from = $request->query('from');
        $to = $request->query('to');

        $query = CcInstallment::query()
            ->where('cc_installments.tenant_id', $tenantId)
            ->with(['contract.customer', 'contract.property']);

        if ($status) {
            $query->where('cc_installments.status', $status);
        }
        if ($overdueOnly) {
            $query->where('cc_installments.status', 'overdue');
        }
        if ($from) {
            $query->whereDate('cc_installments.due_date', '>=', $from);
        }
        if ($to) {
            $query->whereDate('cc_installments.due_date', '<=', $to);
        }
        if ($customerId) {
            $query->whereHas('contract', fn ($c) => $c->where('customer_id', (int) $customerId));
        }
        if ($projectId) {
            $query->whereHas('contract.customer', fn ($c) => $c->where('project_id', (int) $projectId));
        }
        if ($paymentMethod) {
            $query->whereHas('allocations.payment', fn ($p) => $p->where('payment_method', $paymentMethod));
        }

        return response()->json($query->orderBy('due_date')->paginate(50));
    }

    public function pay(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'payInstallment');

        $tenantId = $this->tenantId($request);
        $installment = CcInstallment::where('tenant_id', $tenantId)->with('contract')->findOrFail($id);

        $data = $request->validate([
            'amount' => 'required|numeric|min:0.01',
            'payment_method' => 'nullable|string|in:cash,check,bank_transfer',
            'payment_date' => 'nullable|date',
            'reference_number' => 'nullable|string|max:255',
            'notes' => 'nullable|string',
        ]);

        $result = $this->service->payInstallment($installment, $data, $request->user());

        return response()->json($result, 201);
    }
}

