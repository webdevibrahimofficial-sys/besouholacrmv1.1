<?php

namespace App\Http\Controllers;

use App\Models\Broker;
use App\Models\Entity;
use App\Models\FieldValue;
use App\Models\Visit;
use App\Traits\InventoryDeleteAuthorization;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class BrokerController extends Controller
{
    use InventoryDeleteAuthorization;

    private function rawUtcToIso(?string $raw): ?string
    {
        if (!$raw) {
            return null;
        }

        try {
            return Carbon::parse($raw, 'UTC')->toISOString();
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function normalizeToUtcDbString(string|Carbon|null $value): ?string
    {
        if (!$value) {
            return null;
        }

        try {
            return Carbon::parse($value)->copy()->utc()->format('Y-m-d H:i:s');
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function formatVisit(Visit $visit): array
    {
        $durationMinutes = null;
        try {
            if ($visit->getRawOriginal('check_in_at') && $visit->getRawOriginal('check_out_at')) {
                $durationMinutes = Carbon::parse($visit->getRawOriginal('check_in_at'), 'UTC')
                    ->diffInMinutes(Carbon::parse($visit->getRawOriginal('check_out_at'), 'UTC'));
            }
        } catch (\Throwable $e) {
            $durationMinutes = null;
        }

        return [
            'id' => $visit->id,
            'type' => $visit->type,
            'leadId' => $visit->lead_id,
            'brokerId' => $visit->broker_id,
            'brokerName' => $visit->broker_name,
            'taskId' => $visit->task_id,
            'customerId' => $visit->customer_id,
            'customerName' => $visit->customer_name,
            'salesPerson' => $visit->sales_person_name,
            'salesPersonId' => $visit->sales_person_id,
            'checkInDate' => $this->rawUtcToIso($visit->getRawOriginal('check_in_at')),
            'checkOutDate' => $this->rawUtcToIso($visit->getRawOriginal('check_out_at')),
            'durationMinutes' => $durationMinutes,
            'location' => [
                'lat' => $visit->check_in_lat,
                'lng' => $visit->check_in_lng,
                'address' => $visit->check_in_address,
            ],
            'checkOutLocation' => [
                'lat' => $visit->check_out_lat,
                'lng' => $visit->check_out_lng,
                'address' => $visit->check_out_address,
            ],
            'status' => $visit->status,
        ];
    }

    private function isSalesPersonUser(?object $user): bool
    {
        $role = strtolower(trim((string) ($user->role ?? '')));
        if ($role === '') return false;
        return str_contains($role, 'sales person') || str_contains($role, 'salesperson') || str_contains($role, 'sales_person');
    }

    private function normalizeAssignedSalesPersonIds(array|string|int|null $raw): array
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

    public function show(int $id)
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

    private function currentTenantId(): int|string|null
    {
        if (app()->bound('current_tenant_id')) {
            return app('current_tenant_id');
        }
        if (Auth::check()) {
            return Auth::user()?->tenant_id;
        }
        return null;
    }

    public function attachmentsStore(Request $request, int $id)
    {
        $broker = $this->queryForUser($request)->where('id', $id)->firstOrFail();

        $request->validate([
            'attachments' => 'nullable|array',
            'attachments.*' => 'file|max:10240',
        ]);

        $allFiles = $request->allFiles();
        $files = $allFiles['attachments'] ?? [];
        if (!is_array($files)) {
            $files = $files ? [$files] : [];
        }

        $tenantId = $this->currentTenantId() ?: ($broker->tenant_id ?? 'na');
        $baseDir = "tenants/{$tenantId}/brokers/{$broker->id}/attachments";

        $meta = is_array($broker->meta_data) ? $broker->meta_data : [];
        $attachments = $meta['attachments'] ?? [];
        if (!is_array($attachments)) {
            $attachments = [];
        }

        foreach ($files as $file) {
            if (!$file instanceof UploadedFile) {
                continue;
            }
            if (!$file) {
                continue;
            }
            $attachmentId = (string) Str::uuid();
            $originalName = $file->getClientOriginalName();
            $ext = $file->getClientOriginalExtension();
            $safeName = pathinfo($originalName, PATHINFO_FILENAME);
            $safeName = preg_replace('/[^A-Za-z0-9._-]+/', '_', (string) $safeName);
            $finalName = $safeName . '_' . $attachmentId . ($ext ? '.' . $ext : '');

            $path = $file->storeAs($baseDir, $finalName, 'public');

            $attachments[] = [
                'id' => $attachmentId,
                'name' => $originalName,
                'type' => $file->getClientMimeType(),
                'size' => $file->getSize(),
                'path' => $path,
                'url' => asset('storage/' . ltrim($path, '/')),
                'uploaded_at' => now()->toISOString(),
                'uploaded_by' => $request->user()?->name ?? null,
            ];
        }

        $meta['attachments'] = array_values($attachments);
        $broker->meta_data = $meta;
        $broker->save();

        return response()->json([
            'attachments' => array_values($meta['attachments'] ?? []),
        ]);
    }

    public function destroy(Request $request, int $id)
    {
        if ($resp = $this->authorizeInventoryDelete($request, 'realestate')) {
            return $resp;
        }
        $broker = $this->queryForUser($request)->where('id', $id)->firstOrFail();
        $broker->delete();
        return response()->json(['message' => 'Broker deleted']);
    }

    public function visits(Request $request, int $id)
    {
        $broker = $this->queryForUser($request)->where('id', $id)->firstOrFail();

        $visits = Visit::query()
            ->where('broker_id', $broker->id)
            ->orderByDesc('check_in_at')
            ->get();

        return response()->json([
            'data' => $visits->map(fn (Visit $visit) => $this->formatVisit($visit))->values(),
        ]);
    }

    public function checkIn(Request $request, int $id)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthorized');
        }

        $broker = $this->queryForUser($request)->where('id', $id)->firstOrFail();

        $validator = Validator::make($request->all(), [
            'check_in_date' => 'required|date',
            'lat' => 'nullable|numeric',
            'lng' => 'nullable|numeric',
            'address' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $visit = Visit::create([
            'tenant_id' => $user->tenant_id,
            'broker_id' => $broker->id,
            'broker_name' => $broker->name,
            'type' => 'broker',
            'sales_person_id' => $user->id,
            'sales_person_name' => $user->name,
            'check_in_at' => $this->normalizeToUtcDbString($request->input('check_in_date')),
            'check_in_lat' => $request->input('lat'),
            'check_in_lng' => $request->input('lng'),
            'check_in_address' => $request->input('address'),
            'status' => 'pending',
            'created_by' => $user->id,
        ]);

        return response()->json(['data' => $this->formatVisit($visit)], 201);
    }

    public function checkOut(Request $request, int $id)
    {
        $user = $request->user();
        if (!$user) {
            abort(401, 'Unauthorized');
        }

        $broker = $this->queryForUser($request)->where('id', $id)->firstOrFail();

        $validator = Validator::make($request->all(), [
            'check_out_date' => 'required|date',
            'lat' => 'nullable|numeric',
            'lng' => 'nullable|numeric',
            'address' => 'nullable|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $visit = Visit::query()
            ->where('broker_id', $broker->id)
            ->where('status', 'pending')
            ->orderByDesc('check_in_at')
            ->first();

        if (!$visit) {
            return response()->json(['message' => 'No pending broker visit found'], 404);
        }

        $visit->check_out_at = $this->normalizeToUtcDbString($request->input('check_out_date'));
        $visit->check_out_lat = $request->input('lat');
        $visit->check_out_lng = $request->input('lng');
        $visit->check_out_address = $request->input('address');
        $visit->status = 'accepted';
        $visit->updated_by = $user->id;
        $visit->save();

        return response()->json(['data' => $this->formatVisit($visit)]);
    }
}
