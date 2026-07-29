<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcPayment;
use App\Services\ContractCollectionsService;
use Illuminate\Http\Request;

class CcPaymentsController extends BaseCcController
{
    public function __construct(protected ContractCollectionsService $service)
    {
    }

    public function void(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'payInstallment');

        $tenantId = $this->tenantId($request);
        $payment = CcPayment::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'reason' => 'nullable|string|max:2000',
        ]);

        return response()->json($this->service->voidPayment($payment, $data, $request->user(), 'voided'));
    }

    public function reject(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'payInstallment');

        $tenantId = $this->tenantId($request);
        $payment = CcPayment::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'reason' => 'required|string|max:2000',
        ]);

        return response()->json($this->service->voidPayment($payment, $data, $request->user(), 'rejected'));
    }
}

