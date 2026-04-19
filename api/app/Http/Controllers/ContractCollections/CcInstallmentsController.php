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
        $q = trim((string) $request->query('q', ''));
        $status = $request->query('status');
        $customerId = $request->query('customer_id');
        $projectId = $request->query('project_id');
        $paymentMethod = $request->query('payment_method');
        $overdueOnly = filter_var($request->query('overdue_only', false), FILTER_VALIDATE_BOOLEAN);
        $referenceNumber = trim((string) $request->query('reference_number', ''));
        $paymentDateFrom = $request->query('payment_date_from');
        $paymentDateTo = $request->query('payment_date_to');
        $from = $request->query('from') ?: $request->query('due_date_from');
        $to = $request->query('to') ?: $request->query('due_date_to');

        $query = CcInstallment::query()
            ->where('cc_installments.tenant_id', $tenantId)
            ->with([
                'contract.customer',
                'contract.customer.project:id,name',
                'contract.customer.salesOwner:id,name',
                'contract.property',
                'allocations.payment',
            ]);

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
        if ($referenceNumber !== '') {
            $query->whereHas('allocations.payment', fn ($p) => $p->where('reference_number', 'like', "%{$referenceNumber}%"));
        }
        if ($paymentDateFrom) {
            $query->whereHas('allocations.payment', fn ($p) => $p->whereDate('payment_date', '>=', $paymentDateFrom));
        }
        if ($paymentDateTo) {
            $query->whereHas('allocations.payment', fn ($p) => $p->whereDate('payment_date', '<=', $paymentDateTo));
        }
        if ($q !== '') {
            $query->where(function ($sub) use ($q) {
                $sub->where('cc_installments.id', (int) $q)
                    ->orWhereHas('contract', fn ($c) => $c->where('contract_number', 'like', "%{$q}%"))
                    ->orWhereHas('contract.customer', fn ($c) => $c->where('name', 'like', "%{$q}%")->orWhere('phone', 'like', "%{$q}%"))
                    ->orWhereHas('contract.property', fn ($p) => $p->where('unit_code', 'like', "%{$q}%"));
            });
        }

        $summaryQuery = clone $query;
        $totals = (clone $summaryQuery)->selectRaw('COUNT(*) as total_installments')
            ->selectRaw('COALESCE(SUM(amount),0) as total_amount')
            ->selectRaw('COALESCE(SUM(paid_amount),0) as total_paid_amount')
            ->selectRaw('COALESCE(SUM(amount - paid_amount),0) as total_unpaid_amount')
            ->first();

        $byStatusRows = (clone $summaryQuery)->selectRaw('status, COUNT(*) as cnt')
            ->groupBy('status')
            ->get();

        $byStatus = [];
        foreach ($byStatusRows as $row) {
            $byStatus[(string) $row->status] = (int) $row->cnt;
        }

        $paginator = $query->orderBy('due_date')->paginate(50);

        return response()->json(array_merge($paginator->toArray(), [
            'summary' => [
                'total_installments' => (int) ($totals->total_installments ?? 0),
                'total_amount' => (float) ($totals->total_amount ?? 0),
                'total_paid_amount' => (float) ($totals->total_paid_amount ?? 0),
                'total_unpaid_amount' => (float) ($totals->total_unpaid_amount ?? 0),
                'by_status' => $byStatus,
            ],
        ]));
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

    public function reschedule(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'payInstallment');

        $tenantId = $this->tenantId($request);
        $installment = CcInstallment::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'new_due_date' => 'required|date',
            'notes' => 'nullable|string|max:2000',
        ]);

        $oldDue = $installment->due_date?->toDateString();
        $newDue = (string) $data['new_due_date'];

        $meta = is_array($installment->meta_data) ? $installment->meta_data : [];
        $meta['rescheduled_from'] = $meta['rescheduled_from'] ?? $oldDue;
        $meta['rescheduled_at'] = now()->toDateTimeString();
        $meta['rescheduled_by'] = $request->user()?->id;
        if (!empty($data['notes'])) {
            $meta['reschedule_notes'] = (string) $data['notes'];
        }

        $installment->due_date = $newDue;
        $installment->meta_data = $meta;

        // If unpaid/partial and was overdue, moving due date can reset to pending.
        $amount = (float) $installment->amount;
        $paid = (float) $installment->paid_amount;
        $isFullyPaid = $paid >= $amount && $amount > 0;
        if (!$isFullyPaid) {
            if ($installment->status === 'overdue') {
                $installment->status = 'pending';
            }
        }

        $installment->save();

        try {
            activity('contract_collections')
                ->causedBy($request->user())
                ->performedOn($installment)
                ->withProperties([
                    'action' => 'installment_rescheduled',
                    'installment_id' => $installment->id,
                    'contract_id' => $installment->contract_id,
                    'old_values' => [
                        'due_date' => $oldDue,
                    ],
                    'new_values' => [
                        'due_date' => $newDue,
                    ],
                    'notes' => $data['notes'] ?? null,
                ])
                ->log('cc_installment_rescheduled');
        } catch (\Throwable $e) {
        }

        return response()->json([
            'installment' => $installment,
        ]);
    }
}
