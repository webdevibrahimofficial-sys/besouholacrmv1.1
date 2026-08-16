<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\CrmSetting;
use App\Models\SalesInvoice;
use App\Traits\UserHierarchyTrait;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class OrderController extends Controller
{
    use UserHierarchyTrait;

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        // Explicitly bypass global scope for debugging, and manually filter
        $query = Order::withoutGlobalScope('tenant');
        
        // Manual Tenant Scope
        if (Auth::check() && !$user->is_super_admin) {
            $query->where('tenant_id', $user->tenant_id);
        } elseif (app()->bound('current_tenant_id')) {
            $query->where('tenant_id', app('current_tenant_id'));
        }

        $roleLower = strtolower($user->role ?? '');
        $isAdminOrManager = $user->is_super_admin || 
                            in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

        if (!$isAdminOrManager) {
            $viewableUserIds = $this->getViewableUserIds($user);
            if ($viewableUserIds !== null) {
                // Orders store creator name in created_by, or sales_person name.
                // We'll use names since ID columns are missing.
                $userNames = \App\Models\User::whereIn('id', $viewableUserIds)->pluck('name')->toArray();
                $query->whereIn('sales_person', $userNames);
            } else {
                $query->where('sales_person', $user->name);
            }
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('id', 'like', "%{$search}%")
                  ->orWhere('uuid', 'like', "%{$search}%")
                  ->orWhere('customer_name', 'like', "%{$search}%")
                  ->orWhere('customer_code', 'like', "%{$search}%")
                  ->orWhere('quotation_id', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        // Debug Log
        \Illuminate\Support\Facades\Log::info('Fetching orders for user: ' . Auth::id() . ', Tenant: ' . Auth::user()->tenant_id);
        
        return $query->latest()->paginate(15);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validated = $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'customer_name' => 'required|string',
            'customer_code' => 'nullable|string',
            'sales_person' => 'nullable|string',
            'items' => 'required|array',
            'total' => 'required|numeric',
            'amount' => 'nullable|numeric', // Accept amount (subtotal)
            'status' => 'nullable|string', // ignored; new orders always start as Draft
            'payment_terms' => 'nullable|string',
            'delivery_date' => 'nullable|date',
            'quotation_id' => 'nullable|string',
            'tax' => 'nullable|numeric',
            'discount_rate' => 'nullable|numeric',
            'notes' => 'nullable|string',
        ]);

        if (!isset($validated['amount'])) {
            $validated['amount'] = $validated['total']; // Default amount to total if missing
        }

        $validated['status'] = 'Draft';
        $validated['created_by'] = Auth::user()->name ?? 'System';
        
        // Auto-generate UUID or ID if needed, but ID is auto-increment.
        // Frontend generates "SO-..." IDs sometimes, but backend ID is integer.
        // We can ignore frontend ID for creation and let backend assign it.
        // Or if 'uuid' field is used for SO number.
        
        $order = Order::create($validated);
        $crm = CrmSetting::first();
        $settings = is_array($crm?->settings) ? $crm->settings : [];
        $rawStart = (string) ($settings['startOrderCode'] ?? '0001');
        $start = (int) $rawStart;
        $numberWidth = max(1, strlen(preg_replace('/\D/', '', $rawStart)));
        if (empty($order->uuid)) {
            // Use Start Code + (ID - 1) to ensure uniqueness
            $next = $start + (int)$order->id - 1;
            $order->uuid = 'SO-' . str_pad((string) $next, $numberWidth, '0', STR_PAD_LEFT);
            $order->save();
        }

        return response()->json($order, 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Order $order) // Route binding automatically handles tenant scope
    {
        return $order;
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Order $order) // Route binding automatically handles tenant scope
    {
        // Note: Route Model Binding with BelongsToTenant trait handles authorization implicitly (404 if not found/wrong tenant)
        
        $validated = $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'customer_name' => 'sometimes|string',
            'items' => 'sometimes|array',
            'total' => 'sometimes|numeric',
            'status' => 'sometimes|string',
            'payment_terms' => 'nullable|string',
            'delivery_date' => 'nullable|date',
            'confirmed_at' => 'nullable',
            'shipped_at' => 'nullable',
            'cancel_reason' => 'nullable|string',
            'hold_reason' => 'nullable|string',
        ]);

        // Enforce CRM setting: allowCustomerPaymentPlan
        $crm = CrmSetting::first();
        $settings = is_array($crm?->settings) ? $crm->settings : [];
        $allowCustomerPaymentPlan = (bool)($settings['allowCustomerPaymentPlan'] ?? true);
        if (!$allowCustomerPaymentPlan) {
            unset($validated['payment_terms']);
        }

        if (! $order->exists) {
            abort(404);
        }

        if (array_key_exists('confirmed_at', $validated)) {
            $validated['confirmed_at'] = $this->parseOptionalDate($validated['confirmed_at']);
        }
        if (array_key_exists('shipped_at', $validated)) {
            $validated['shipped_at'] = $this->parseOptionalDate($validated['shipped_at']);
        }

        $nextStatus = $validated['status'] ?? null;
        $order->fill($validated);

        if (is_string($nextStatus) && strcasecmp($nextStatus, 'Confirmed') === 0 && empty($order->confirmed_at)) {
            $order->confirmed_at = now();
        }

        $order->save();

        return response()->json($order->fresh());
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Order $order)
    {
        $order->delete();
        return response()->noContent();
    }

    public function attachmentsIndex(Order $order)
    {
        $meta = is_array($order->meta_data) ? $order->meta_data : [];
        $attachments = $meta['attachments'] ?? [];
        return response()->json(array_values($attachments));
    }

    public function attachmentsStore(Request $request, Order $order)
    {
        $request->validate([
            'files' => 'required|array',
            'files.*' => 'file|max:10240',
        ]);

        $meta = is_array($order->meta_data) ? $order->meta_data : [];
        $attachments = is_array($meta['attachments'] ?? null) ? $meta['attachments'] : [];

        foreach ($request->file('files', []) as $file) {
            $id = (string) Str::uuid();
            $original = $file->getClientOriginalName();
            $ext = $file->getClientOriginalExtension();
            $safeBase = pathinfo($original, PATHINFO_FILENAME);
            $safeBase = preg_replace('/[^A-Za-z0-9_\-]+/', '_', $safeBase) ?: 'file';
            $filename = $safeBase . '_' . $id . ($ext ? ('.' . $ext) : '');

            $path = $file->storeAs(
                "tenants/{$order->tenant_id}/orders/{$order->id}/attachments",
                $filename,
                'public'
            );

            $attachments[] = [
                'id' => $id,
                'name' => $original,
                'path' => $path,
                'url' => asset('storage/' . ltrim($path, '/')),
                'size' => $file->getSize(),
                'mime' => $file->getMimeType(),
                'created_at' => now()->toISOString(),
            ];
        }

        $meta['attachments'] = $attachments;
        $order->meta_data = $meta;
        $order->save();

        return response()->json(array_values($attachments));
    }

    public function attachmentsDestroy(Order $order, string $attachmentId)
    {
        $meta = is_array($order->meta_data) ? $order->meta_data : [];
        $attachments = is_array($meta['attachments'] ?? null) ? $meta['attachments'] : [];

        $kept = [];
        $deletedPath = null;
        foreach ($attachments as $att) {
            if ((string)($att['id'] ?? '') === (string)$attachmentId) {
                $deletedPath = $att['path'] ?? null;
                continue;
            }
            $kept[] = $att;
        }

        if ($deletedPath) {
            try {
                Storage::disk('public')->delete($deletedPath);
            } catch (\Throwable $e) {
            }
        }

        $meta['attachments'] = $kept;
        $order->meta_data = $meta;
        $order->save();

        return response()->noContent();
    }

    public function advanceSummary(Order $order)
    {
        $orderId = (int) $order->id;

        $availableAdvance = (float) SalesInvoice::where('order_id', $orderId)
            ->where('status', '!=', 'Cancelled')
            ->whereRaw("LOWER(COALESCE(invoice_type,'')) = 'advance'")
            ->sum('paid_amount');

        $usedAdvance = (float) SalesInvoice::where('order_id', $orderId)
            ->where('status', '!=', 'Cancelled')
            ->whereRaw("LOWER(COALESCE(invoice_type,'')) != 'advance'")
            ->sum('advance_applied_amount');

        $remaining = max(0, $availableAdvance - $usedAdvance);

        return response()->json([
            'order_id' => $orderId,
            'available_advance' => $availableAdvance,
            'used_advance' => $usedAdvance,
            'remaining_advance' => $remaining,
        ]);
    }

    private function parseOptionalDate(mixed $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable $e) {
            return now();
        }
    }
}
