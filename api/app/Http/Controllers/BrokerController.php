<?php

namespace App\Http\Controllers;

use App\Models\Broker;
use App\Models\Entity;
use App\Models\FieldValue;
use App\Traits\InventoryDeleteAuthorization;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class BrokerController extends Controller
{
    use InventoryDeleteAuthorization;

    private function isSalesPersonUser($user): bool
    {
        $role = strtolower(trim((string) ($user->role ?? '')));
        if ($role === '') return false;
        return str_contains($role, 'sales person') || str_contains($role, 'salesperson') || str_contains($role, 'sales_person');
    }

    private function normalizeAssignedSalesPersonIds($raw): array
    {
        if ($raw === null) return [];
        $vals = is_array($raw) ? $raw : [$raw];
        $ids = [];
        foreach ($vals as $v) {
            if ($v === null) continue;
            $s = trim((string) $v);
            if ($s === '') continue;
            // Support comma-separated values.
            foreach (preg_split('/\s*,\s*/', $s) as $part) {
                $part = trim((string) $part);
                if ($part === '') continue;
                if (is_numeric($part)) {
                    $n = (int) $part;
                    if ($n > 0) $ids[] = $n;
                }
            }
        }
        $ids = array_values(array_unique($ids));
        sort($ids);
        return $ids;
    }

    private function queryForUser(Request $request)
    {
        $user = $request->user();
        $query = Broker::query()->with('customFieldValues.field')->latest();
        if ($user && !$user->is_super_admin && $this->isSalesPersonUser($user)) {
            $query->where(function ($q) use ($user) {
                $q->whereJsonContains('meta_data->assigned_sales_person_ids', (int) $user->id)
                  // Backward compatibility keys (if any legacy data exists)
                  ->orWhereJsonContains('meta_data->sales_person_ids', (int) $user->id)
                  ->orWhereJsonContains('meta_data->salesPersons', (int) $user->id);
            });
        }
        return $query;
    }

    public function index(Request $request)
    {
        return $this->queryForUser($request)->paginate(10);
    }

    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'agencyName' => 'nullable|string',
            'address' => 'nullable|string',
            'email' => 'nullable|email',
            'commissionRate' => 'nullable|numeric',
            'status' => 'nullable|string',
            'brokerType' => 'nullable|string',
            'contracted' => 'boolean',
            'taxId' => 'nullable|string',
            'nationalId' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Custom Fields Validation
        $entity = Entity::where('key', 'brokers')->first();
        if ($entity) {
            $customFields = $entity->fields;
            $customRules = [];
            foreach ($customFields as $field) {
                if ($field->required && $field->active) {
                    $customRules['custom_fields.' . $field->key] = 'required';
                }
            }
            if (!empty($customRules)) {
                $customValidator = Validator::make($request->all(), $customRules);
                if ($customValidator->fails()) {
                     return response()->json(['errors' => $customValidator->errors()], 422);
                }
            }
        }

        try {
            DB::beginTransaction();

            $data = $request->only(['name']);
            
            // Map camelCase to snake_case
            if ($request->has('agencyName')) $data['agency_name'] = $request->input('agencyName');
            if ($request->has('address')) $data['address'] = $request->input('address');
            if ($request->has('email')) $data['email'] = $request->input('email');
            if ($request->has('commissionRate')) $data['commission_rate'] = $request->input('commissionRate');
            if ($request->has('status')) $data['status'] = $request->input('status');
            if ($request->has('brokerType')) $data['broker_type'] = $request->input('brokerType');
            if ($request->has('contracted')) $data['contracted'] = $request->input('contracted');
            if ($request->has('taxId')) $data['tax_id'] = $request->input('taxId');
            if ($request->has('nationalId')) $data['national_id'] = $request->input('nationalId');

            if ($request->has('phones') && is_array($request->input('phones'))) {
                $data['phone'] = implode(',', $request->input('phones'));
            } elseif ($request->has('phone')) {
                $data['phone'] = $request->input('phone');
            }

            // Assignment: sales person can only assign to themselves. Others can assign explicitly.
            $user = $request->user();
            $assignedIds = $this->normalizeAssignedSalesPersonIds($request->input('salesPersons'));
            if ($user && $this->isSalesPersonUser($user) && !$user->is_super_admin) {
                $assignedIds = [(int) $user->id];
            }
            if (!empty($assignedIds)) {
                $meta = is_array($request->input('meta_data')) ? $request->input('meta_data') : [];
                if (!is_array($meta)) $meta = [];
                $meta['assigned_sales_person_ids'] = $assignedIds;
                $data['meta_data'] = $meta;
            }

            $broker = Broker::create($data);

            if ($request->has('custom_fields') && $entity) {
                $fieldsMap = $entity->fields->pluck('id', 'key');
                foreach ($request->input('custom_fields') as $key => $value) {
                    if (isset($fieldsMap[$key])) {
                        FieldValue::create([
                            'field_id' => $fieldsMap[$key],
                            'record_id' => $broker->id,
                            'value' => $value,
                        ]);
                    }
                }
            }

            DB::commit();
            return response()->json($broker->load('customFieldValues.field'), 201);

        } catch (\Exception $e) {
            DB::rollBack();
            return response()->json(['message' => 'Failed to create broker', 'error' => $e->getMessage()], 500);
        }
    }

    public function show($id)
    {
        return $this->queryForUser(request())->where('id', $id)->firstOrFail();
    }

    public function update(Request $request, $id)
    {
        $broker = $this->queryForUser($request)->where('id', $id)->firstOrFail();

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'agencyName' => 'nullable|string',
            'address' => 'nullable|string',
            'email' => 'nullable|email',
            'commissionRate' => 'nullable|numeric',
            'status' => 'nullable|string',
            'brokerType' => 'nullable|string',
            'contracted' => 'boolean',
            'taxId' => 'nullable|string',
            'nationalId' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }
        
        $data = $request->only(['name']);
        
        // Map camelCase to snake_case
        if ($request->has('agencyName')) $data['agency_name'] = $request->input('agencyName');
        if ($request->has('address')) $data['address'] = $request->input('address');
        if ($request->has('email')) $data['email'] = $request->input('email');
        if ($request->has('commissionRate')) $data['commission_rate'] = $request->input('commissionRate');
        if ($request->has('status')) $data['status'] = $request->input('status');
        if ($request->has('brokerType')) $data['broker_type'] = $request->input('brokerType');
        if ($request->has('contracted')) $data['contracted'] = $request->input('contracted');
        if ($request->has('taxId')) $data['tax_id'] = $request->input('taxId');
        if ($request->has('nationalId')) $data['national_id'] = $request->input('nationalId');

        if ($request->has('phones') && is_array($request->input('phones'))) {
            $data['phone'] = implode(',', $request->input('phones'));
        } elseif ($request->has('phone')) {
            $data['phone'] = $request->input('phone');
        }

        // Assignment updates (manager/admin only). Sales person cannot reassign away.
        $user = $request->user();
        $isSales = $user && !$user->is_super_admin && $this->isSalesPersonUser($user);
        if ($request->has('salesPersons') || $isSales) {
            $assignedIds = $this->normalizeAssignedSalesPersonIds($request->input('salesPersons'));
            if ($isSales) {
                $assignedIds = [(int) $user->id];
            }
            $meta = is_array($broker->meta_data ?? null) ? ($broker->meta_data ?? []) : [];
            if (!is_array($meta)) $meta = [];
            $meta['assigned_sales_person_ids'] = $assignedIds;
            $data['meta_data'] = $meta;
        }
        
        $broker->update($data);
        
        $entity = Entity::where('key', 'brokers')->first();
        if ($request->has('custom_fields') && $entity) {
            $fieldsMap = $entity->fields->pluck('id', 'key');
            foreach ($request->input('custom_fields') as $key => $value) {
                if (isset($fieldsMap[$key])) {
                    FieldValue::updateOrCreate(
                        ['field_id' => $fieldsMap[$key], 'record_id' => $broker->id],
                        ['value' => $value]
                    );
                }
            }
        }
        
        return response()->json($broker->load('customFieldValues.field'));
    }

    public function destroy(Request $request, $id)
    {
        if ($resp = $this->authorizeInventoryDelete($request, 'realestate')) {
            return $resp;
        }
        $broker = $this->queryForUser($request)->where('id', $id)->firstOrFail();
        $broker->delete();
        return response()->json(['message' => 'Broker deleted']);
    }
}
