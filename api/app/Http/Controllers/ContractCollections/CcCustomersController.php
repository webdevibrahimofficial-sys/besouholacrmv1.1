<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcCustomerUnit;
use App\Models\CcCustomer;
use App\Models\Property;
use App\Services\ContractCollectionsService;
use Illuminate\Http\Request;

class CcCustomersController extends BaseCcController
{
    public function __construct(protected ContractCollectionsService $service)
    {
    }

    public function index(Request $request)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $q = trim((string) $request->query('q', ''));
        $projectId = $request->query('project_id');
        $salesOwnerId = $request->query('sales_owner_id');
        $propertyId = $request->query('property_id');
        $source = trim((string) $request->query('source', ''));

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
        if ($salesOwnerId) {
            $query->where('sales_owner_id', (int) $salesOwnerId);
        }
        if ($propertyId) {
            $query->whereHas('units', function ($sub) use ($propertyId) {
                $sub->where('property_id', (int) $propertyId);
            });
        }
        if ($source !== '') {
            $query->where('source', $source);
        }

        $user = $request->user();
        if ($user && !$this->isTenantAdmin($user) && $this->isSalesPerson($user)) {
            $query->where('sales_owner_id', (int) $user->id);
        }

        $perPage = (int) $request->query('per_page', 25);
        if ($perPage <= 0) {
            $perPage = 25;
        }
        if ($perPage > 200) {
            $perPage = 200;
        }

        $customers = $query
            ->with([
                'project:id,name',
                'salesOwner:id,name',
                'units.property:id,project_id,unit_code,name',
            ])
            ->orderByDesc('id')
            ->paginate($perPage);

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
            'property_id' => 'nullable|integer',
            'name' => 'required|string|max:255',
            'phone' => 'nullable|string|max:100',
            'email' => 'nullable|string|max:255',
            'source' => 'nullable|string|max:255',
            'last_comments' => 'nullable|string',
        ]);

        $data['tenant_id'] = $tenantId;

        $propertyId = $data['property_id'] ?? null;
        unset($data['property_id']);

        $customer = CcCustomer::create($data);

        if ($propertyId) {
            $unit = $this->service->createCustomerUnit([
                'customer_id' => $customer->id,
                'property_id' => (int) $propertyId,
                'status' => 'reserved',
                'meta_data' => [
                    'created_from' => 'cc_customers_store',
                ],
            ], $request->user());

            $meta = is_array($customer->meta_data) ? $customer->meta_data : [];
            $meta['primary_customer_unit_id'] = $unit->id;
            $customer->meta_data = $meta;
            $customer->save();
        }

        return response()->json($customer, 201);
    }

    public function show(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $customer = CcCustomer::where('tenant_id', $tenantId)->with([
            'units.property',
            'units.activePaymentPlan',
            'project:id,name',
            'salesOwner:id,name',
            'contracts' => function ($q) {
                $q->orderByDesc('contract_date');
            },
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
            'property_id' => 'nullable|integer',
            'name' => 'sometimes|required|string|max:255',
            'phone' => 'nullable|string|max:100',
            'email' => 'nullable|string|max:255',
            'source' => 'nullable|string|max:255',
            'last_comments' => 'nullable|string',
        ]);

        $propertyId = $data['property_id'] ?? null;
        unset($data['property_id']);

        $customer->fill($data);
        $customer->save();

        if ($propertyId) {
            $unit = $this->service->createCustomerUnit([
                'customer_id' => $customer->id,
                'property_id' => (int) $propertyId,
                'status' => 'reserved',
                'meta_data' => [
                    'created_from' => 'cc_customers_update',
                ],
            ], $request->user());

            $meta = is_array($customer->meta_data) ? $customer->meta_data : [];
            $meta['primary_customer_unit_id'] = $unit->id;
            $customer->meta_data = $meta;
            $customer->save();
        }

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
