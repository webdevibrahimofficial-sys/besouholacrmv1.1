<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcContract;
use App\Models\CcPayment;
use Illuminate\Http\Request;

class CcPrintController extends BaseCcController
{
    public function printContract(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'viewContracts');

        $tenantId = $this->tenantId($request);
        $contract = CcContract::where('tenant_id', $tenantId)->with(['customer', 'property', 'installments'])->findOrFail($id);

        return response()->json([
            'message' => 'Print is not implemented yet (template/PDF).',
            'contract' => $contract,
        ], 501);
    }

    public function printReceipt(Request $request, int $paymentId)
    {
        $this->requireCcPermission($request, 'printReceipt');

        $tenantId = $this->tenantId($request);
        $payment = CcPayment::where('tenant_id', $tenantId)->with(['customer', 'contract', 'allocations.installment'])->findOrFail($paymentId);

        return response()->json([
            'message' => 'Receipt printing is not implemented yet (template/PDF).',
            'payment' => $payment,
        ], 501);
    }
}

