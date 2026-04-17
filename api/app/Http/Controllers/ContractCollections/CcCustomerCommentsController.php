<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcComment;
use App\Models\CcCustomer;
use Illuminate\Http\Request;

class CcCustomerCommentsController extends BaseCcController
{
    public function index(Request $request, int $customerId)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        CcCustomer::where('tenant_id', $tenantId)->findOrFail($customerId);

        $items = CcComment::query()
            ->where('tenant_id', $tenantId)
            ->where('related_type', 'customer')
            ->where('related_id', $customerId)
            ->with(['creator:id,name'])
            ->orderByDesc('id')
            ->limit(200)
            ->get();

        return response()->json(['data' => $items]);
    }

    public function store(Request $request, int $customerId)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        CcCustomer::where('tenant_id', $tenantId)->findOrFail($customerId);

        $data = $request->validate([
            'comment' => 'required|string|max:5000',
        ]);

        $item = CcComment::create([
            'tenant_id' => $tenantId,
            'related_type' => 'customer',
            'related_id' => $customerId,
            'comment' => $data['comment'],
            'created_by' => $request->user()?->id,
        ]);

        return response()->json($item->load(['creator:id,name']), 201);
    }
}

