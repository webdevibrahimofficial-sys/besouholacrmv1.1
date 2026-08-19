<?php

namespace App\Http\Controllers;

use App\Models\Quotation;
use App\Models\CrmSetting;
use App\Services\ItemStockService;
use App\Support\StartCodeGenerator;
use App\Traits\UserHierarchyTrait;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class QuotationController extends Controller
{
    use UserHierarchyTrait;

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $query = Quotation::query()->with('customer');

        $roleLower = strtolower($user->role ?? '');
        $isAdminOrManager = $user->is_super_admin || 
                            in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

        if (!$isAdminOrManager) {
            $viewableUserIds = $this->getViewableUserIds($user);
            if ($viewableUserIds !== null) {
                // Get the names of the users in the hierarchy to filter by sales_person string
                $userNames = \App\Models\User::whereIn('id', $viewableUserIds)->pluck('name')->toArray();
                $query->whereIn('sales_person', $userNames);
            } else {
                $query->where('sales_person', $user->name);
            }
        }
        
        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('id', 'like', "%{$search}%")
                  ->orWhere('customer_name', 'like', "%{$search}%")
                  ->orWhere('customer_id', 'like', "%{$search}%");
            });
        }

        if ($request->has('dateFrom')) {
            $query->whereDate('created_at', '>=', $request->dateFrom);
        }
        if ($request->has('dateTo')) {
            $query->whereDate('created_at', '<=', $request->dateTo);
        }
        if ($request->has('customer')) {
            $query->where('customer_name', $request->customer);
        }
        if ($request->has('createdBy')) {
            $query->where('created_by', $request->createdBy);
        }
        if ($request->has('salesPerson')) {
            $query->where('sales_person', $request->salesPerson);
        }
        if ($request->has('minTotal')) {
            $query->where('total', '>=', $request->minTotal);
        }
        if ($request->has('maxTotal')) {
            $query->where('total', '<=', $request->maxTotal);
        }
        // For items count, we need to check the JSON array length or fetch related items if relational.
        // Assuming items is a JSON column.
        if ($request->has('minItems')) {
            $query->whereRaw('JSON_LENGTH(items) >= ?', [$request->minItems]);
        }
        if ($request->has('maxItems')) {
            $query->whereRaw('JSON_LENGTH(items) <= ?', [$request->maxItems]);
        }

        if ($request->has('all')) {
            return response()->json($query->latest()->get());
        }
        
        return response()->json($query->latest()->paginate(15));
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        // Allow items to be string (JSON) for FormData support
        if ($request->has('items') && is_string($request->input('items'))) {
            $request->merge(['items' => json_decode($request->input('items'), true)]);
        }

        $validator = Validator::make($request->all(), [
            'customer_id' => 'nullable|string',
            'customer_name' => 'nullable|string',
            'status' => 'nullable|string',
            'date' => 'nullable|date',
            'valid_until' => 'nullable|date',
            'subtotal' => 'nullable|numeric',
            'tax' => 'nullable|numeric',
            'tax_rate' => 'nullable|numeric',
            'taxRate' => 'nullable|numeric',
            'is_tax_enabled' => 'nullable',
            'isTaxEnabled' => 'nullable',
            'total' => 'nullable|numeric',
            'items' => 'nullable|array',
            'notes' => 'nullable|string',
            'sales_person' => 'nullable|string',
            'attachment' => 'nullable|file|max:10240', // 10MB max
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $request->except(['attachment', 'attachments', '_method', '_token']);
        unset($data['meta_data']);
        $meta = $this->decodeMetaData($request->input('meta_data'));

        $subtotal = isset($data['subtotal']) ? (float) $data['subtotal'] : 0.0;
        $total = isset($data['total']) ? (float) $data['total'] : 0.0;
        $taxMissing = !array_key_exists('tax', $data) || $data['tax'] === null || $data['tax'] === '';
        if ($taxMissing) {
            $data['tax'] = max(0, $total - $subtotal);
        }

        $meta = $this->applyAttachmentToMeta($request, $meta);
        $data = $this->filterQuotationAttributes($data, $meta);

        $quotation = new Quotation($data);
        $quotation->meta_data = $meta;
        $quotation->save();

        $settings = CrmSetting::resolved();
        if (empty($meta['quotation_code'])) {
            $existingCodes = Quotation::query()
                ->whereNotNull('meta_data')
                ->get()
                ->map(fn ($row) => data_get($row->meta_data, 'quotation_code'))
                ->filter();
            $meta['quotation_code'] = StartCodeGenerator::next(
                $existingCodes,
                (string) ($settings['startQuotationCode'] ?? '0001'),
                'Q-'
            );
            $quotation->meta_data = $meta;
            $quotation->save();
        }

        $requestId = (int) ($meta['converted_from_request_id'] ?? 0);
        if ($requestId > 0) {
            $inventoryRequest = \App\Models\InventoryRequest::query()->find($requestId);
            if ($inventoryRequest) {
                app(ItemStockService::class)->freezeRequest($inventoryRequest);
                if (strcasecmp((string) $inventoryRequest->status, 'Converted') !== 0) {
                    $inventoryRequest->status = 'Converted';
                    $inventoryRequest->save();
                }
            }
        }
        
        return response()->json($quotation, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Quotation $quotation)
    {
        return response()->json($quotation);
    }

    public function attachmentsIndex(Quotation $quotation)
    {
        return response()->json($this->normalizedAttachments($this->decodeMetaData($quotation->meta_data)));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Quotation $quotation)
    {
        if ($request->has('items') && is_string($request->input('items'))) {
            $request->merge(['items' => json_decode($request->input('items'), true)]);
        }

        $data = $request->except(['attachment', 'attachments', '_method', '_token']);
        unset($data['meta_data']);
        $subtotal = isset($data['subtotal']) ? (float) $data['subtotal'] : (float) ($quotation->subtotal ?? 0);
        $total = isset($data['total']) ? (float) $data['total'] : (float) ($quotation->total ?? 0);
        $taxMissing = !array_key_exists('tax', $data) || $data['tax'] === null || $data['tax'] === '';
        if ($taxMissing) {
            $data['tax'] = max(0, $total - $subtotal);
        }

        $meta = $this->decodeMetaData($quotation->meta_data);
        if ($request->exists('meta_data')) {
            $meta = array_merge($meta, $this->decodeMetaData($request->input('meta_data')));
        }
        $meta = $this->applyAttachmentToMeta($request, $meta);
        $data = $this->filterQuotationAttributes($data, $meta);

        $previousStatus = strtolower((string) $quotation->status);
        $quotation->fill($data);
        $quotation->meta_data = $meta;
        $quotation->save();
        $nextStatus = strtolower((string) $quotation->status);
        if (in_array($nextStatus, ['cancelled', 'canceled', 'lost', 'rejected'], true)
            && !in_array($previousStatus, ['cancelled', 'canceled', 'lost', 'rejected'], true)) {
            app(ItemStockService::class)->releaseQuotation($quotation->fresh());
        }
        return response()->json($quotation->fresh());
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Quotation $quotation)
    {
        app(ItemStockService::class)->releaseQuotation($quotation);
        $quotation->delete();
        return response()->json(null, 204);
    }

    private function filterQuotationAttributes(array $data, array &$meta): array
    {
        $columns = Schema::getColumnListing('quotations');
        if (array_key_exists('tax', $data) && !in_array('tax', $columns, true)) {
            $meta['tax'] = $data['tax'];
        }

        $taxRate = $data['tax_rate'] ?? $data['taxRate'] ?? null;
        if ($taxRate !== null && $taxRate !== '') {
            $meta['tax_rate'] = (float) $taxRate;
        }

        $isTaxEnabled = $data['is_tax_enabled'] ?? $data['isTaxEnabled'] ?? null;
        if ($isTaxEnabled !== null && $isTaxEnabled !== '') {
            $meta['is_tax_enabled'] = filter_var($isTaxEnabled, FILTER_VALIDATE_BOOLEAN);
        }

        $filtered = array_intersect_key($data, array_flip($columns));
        unset($filtered['id']);

        return $filtered;
    }

    private function decodeMetaData(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (is_string($value) && trim($value) !== '') {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return [];
    }

    private function applyAttachmentToMeta(Request $request, array $meta): array
    {
        if (!$request->hasFile('attachment')) {
            return $meta;
        }

        $file = $request->file('attachment');
        $path = $file->store('quotations', 'public');
        $meta['attachment'] = $path;
        $meta['attachment_name'] = $file->getClientOriginalName();
        $meta['attachment_type'] = $file->getClientMimeType();
        $meta['attachment_size'] = $file->getSize();

        $attachments = is_array($meta['attachments'] ?? null) ? $meta['attachments'] : [];
        $attachments[] = [
            'id' => (string) Str::uuid(),
            'name' => $meta['attachment_name'],
            'path' => $path,
            'url' => asset('storage/' . ltrim((string) $path, '/')),
            'size' => $meta['attachment_size'],
            'mime' => $meta['attachment_type'],
            'created_at' => now()->toISOString(),
        ];
        $meta['attachments'] = array_values($attachments);

        return $meta;
    }

    private function normalizedAttachments(array $meta): array
    {
        $attachments = is_array($meta['attachments'] ?? null) ? array_values($meta['attachments']) : [];
        if ($attachments) {
            return $attachments;
        }

        $path = $meta['attachment'] ?? null;
        if (!$path) {
            return [];
        }

        return [[
            'id' => 'legacy',
            'name' => $meta['attachment_name'] ?? basename((string) $path),
            'path' => $path,
            'url' => asset('storage/' . ltrim((string) $path, '/')),
            'size' => $meta['attachment_size'] ?? null,
            'mime' => $meta['attachment_type'] ?? null,
        ]];
    }
}
