<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcCustomer;
use Illuminate\Http\Request;

class CcCustomersController extends BaseCcController
{
    public function index(Request $request)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $q = trim((string) $request->query('q', ''));
        $projectId = $request->query('project_id');

        $query = CcCustomer::query()->where('tenant_id', $tenantId);

        if ($q !== '') {
            $query->where(function ($sub) use ($q) {
                $sub->where('name', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%");
            });
        }
        if ($projectId) {
            $query->where('project_id', (int) $projectId);
        }

        $customers = $query->orderByDesc('id')->paginate(25);

        return response()->json($customers);
    }

    public function store(Request $request)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $data = $request->validate([
            'lead_id' => 'nullable|integer',
            'project_id' => 'nullable|integer',
            'sales_owner_id' => 'nullable|integer',
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string|max:100',
            'email' => 'nullable|string|max:255',
            'source' => 'nullable|string|max:255',
            'last_comments' => 'nullable|string',
        ]);

        $data['tenant_id'] = $tenantId;

        $customer = CcCustomer::create($data);

        return response()->json($customer, 201);
    }

    public function show(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $customer = CcCustomer::where('tenant_id', $tenantId)->with([
            'units.property',
            'contracts.installments',
            'contracts.payments',
        ])->findOrFail($id);

        $totalContractValue = (float) $customer->contracts->sum('total_price');
        $totalPaid = (float) $customer->contracts->flatMap->payments->sum('amount');
        $outstanding = $totalContractValue - $totalPaid;

        return response()->json([
            'customer' => $customer,
            'totals' => [
                'total_contract_value' => $totalContractValue,
                'total_paid' => $totalPaid,
                'outstanding_balance' => $outstanding,
            ],
        ]);
    }

    public function update(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $customer = CcCustomer::where('tenant_id', $tenantId)->findOrFail($id);

        $data = $request->validate([
            'project_id' => 'nullable|integer',
            'sales_owner_id' => 'nullable|integer',
            'name' => 'sometimes|required|string|max:255',
            'phone' => 'nullable|string|max:100',
            'email' => 'nullable|string|max:255',
            'source' => 'nullable|string|max:255',
            'last_comments' => 'nullable|string',
        ]);

        $customer->fill($data);
        $customer->save();

        return response()->json($customer);
    }

    public function destroy(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $customer = CcCustomer::where('tenant_id', $tenantId)->findOrFail($id);
        $customer->delete();

        return response()->noContent();
    }
}
