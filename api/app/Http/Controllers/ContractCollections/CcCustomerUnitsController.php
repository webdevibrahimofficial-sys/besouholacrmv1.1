<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcCustomerUnit;
use App\Services\ContractCollectionsService;
use Illuminate\Http\Request;

class CcCustomerUnitsController extends BaseCcController
{
    public function __construct(protected ContractCollectionsService $service)
    {
    }

    public function store(Request $request)
    {
        $this->requireCcPermission($request, 'showModule');

        $data = $request->validate([
            'customer_id' => 'required|integer|exists:cc_customers,id',
            'property_id' => 'required|integer|exists:properties,id',
            'status' => 'nullable|string|in:reserved,contracted',
        ]);

        $unit = $this->service->createCustomerUnit($data, $request->user());

        return response()->json($unit->load(['customer', 'property']), 201);
    }

    public function update(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $unit = CcCustomerUnit::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'status' => 'nullable|string|in:reserved,contracted',
        ]);

        if (isset($data['status'])) {
            $unit->status = $data['status'];
            if ($data['status'] === 'reserved' && !$unit->reserved_at) $unit->reserved_at = now();
            if ($data['status'] === 'contracted' && !$unit->contracted_at) $unit->contracted_at = now();
        }

        $unit->save();

        return response()->json($unit->fresh(['customer', 'property']));
    }

    public function createPaymentPlanVersion(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $unit = CcCustomerUnit::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'reservation_amount' => 'nullable|numeric|min:0',
            'down_payment' => 'nullable|numeric|min:0',
            'delivery_payment' => 'nullable|numeric|min:0',
            'installment_type' => 'nullable|string|in:monthly,quarterly,half-yearly,yearly,half_yearly,halfyearly,annual,annually',
            'installment_count' => 'nullable|integer|min:0',
            'installment_value' => 'nullable|numeric|min:0',
        ]);

        $plan = $this->service->createPaymentPlanVersion($unit, $data, $request->user());

        return response()->json($plan, 201);
    }
}

