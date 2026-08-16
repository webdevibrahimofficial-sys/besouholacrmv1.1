<?php

namespace App\Http\Controllers;

use App\Models\SalesInvoice;
use App\Models\SalesInvoicePayment;
use App\Models\Order;
use App\Models\User;
use App\Notifications\InvoiceCreated;
use App\Services\ItemStockService;
use App\Traits\ResolvesNotificationRecipients;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SalesInvoiceController extends Controller
{
    use ResolvesNotificationRecipients;

    private function recalculateInvoiceFinancials(SalesInvoice $invoice): SalesInvoice
    {
        $paid = (float) $invoice->payments()
            ->where('status', 'confirmed')
            ->sum('amount');

        $invoice->paid_amount = $paid;

        $advanceApplied = (float) ($invoice->advance_applied_amount ?? 0);
        $total = (float) ($invoice->total ?? 0);
        $invoice->balance_due = max(0, $total - $paid - $advanceApplied);

        $statusLower = strtolower((string) $invoice->status);

        // Keep workflow status separate from settlement status:
        // - status: Draft / Posted / Cancelled
        // - payment_status: Unpaid / Partial / Paid
        if ($statusLower !== 'cancelled') {
            if ($invoice->balance_due <= 0) {
                $invoice->payment_status = 'Paid';
            } elseif ($paid > 0 || $advanceApplied > 0) {
                $invoice->payment_status = 'Partial';
            } else {
                $invoice->payment_status = 'Unpaid';
            }

            // Backward-compat: older code wrote settlement states into `status`.
            // Normalize them back to workflow `Posted` going forward.
            if (in_array($statusLower, ['unpaid', 'partial', 'partially paid', 'paid', 'overdue'], true)) {
                $invoice->status = 'Posted';
            }
        }

        $invoice->save();
        return $invoice;
    }

    private function isPostedLike(?string $status): bool
    {
        $status = strtolower(trim((string) $status));
        return in_array($status, ['posted', 'paid', 'partial', 'partially paid', 'unpaid', 'overdue'], true);
    }

    private function isCancelledLike(?string $status): bool
    {
        return in_array(strtolower(trim((string) $status)), ['cancelled', 'canceled'], true);
    }

    private function orderLineItemsTotal(Order $order): float
    {
        $orderItemsTotal = 0.0;
        $orderItems = is_array($order->items) ? $order->items : [];
        foreach ($orderItems as $line) {
            $line = is_array($line) ? $line : (array) $line;
            $qty = (float) ($line['quantity'] ?? $line['qty'] ?? 0);
            $price = (float) ($line['price'] ?? $line['unit_price'] ?? 0);
            $discount = (float) ($line['discount'] ?? 0);
            $orderItemsTotal += ($qty * $price) - $discount;
        }

        return $orderItemsTotal;
    }

    private function invoiceNetAmount(float $total, float $tax = 0, float $subtotal = 0): float
    {
        if ($subtotal > 0.0001) {
            return $subtotal;
        }

        return max(0, $total - $tax);
    }

    private function orderNetCap(Order $order): float
    {
        $orderItemsTotal = $this->orderLineItemsTotal($order);
        $orderTotal = (float) ($order->total ?? 0);
        $orderTax = (float) ($order->tax ?? 0);
        $orderNet = $orderTax > 0 && $orderTotal > $orderTax
            ? $orderTotal - $orderTax
            : $orderTotal;

        return max($orderItemsTotal, $orderNet);
    }

    private function existingInvoicedNet(int $orderId, ?int $exceptInvoiceId = null): float
    {
        $query = SalesInvoice::query()
            ->where('order_id', $orderId)
            ->where('status', '!=', 'Cancelled')
            ->whereRaw("LOWER(COALESCE(invoice_type,'')) != 'advance'");

        if ($exceptInvoiceId) {
            $query->where('id', '!=', $exceptInvoiceId);
        }

        return (float) $query->get(['subtotal', 'total', 'tax'])->sum(function (SalesInvoice $invoice) {
            return $this->invoiceNetAmount(
                (float) ($invoice->total ?? 0),
                (float) ($invoice->tax ?? 0),
                (float) ($invoice->subtotal ?? 0)
            );
        });
    }
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $query = SalesInvoice::query()->with([
            'order:id,uuid',
            'customer:id,name,email',
        ]);

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('invoice_number', 'like', "%{$search}%")
                  ->orWhere('customer_name', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

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
            'customer_address' => 'nullable|string',
            'sales_person' => 'nullable|string',
            'order_id' => 'nullable|exists:orders,id',
            'invoice_type' => 'nullable|string',
            'issue_date' => 'required|date',
            'due_date' => 'nullable|date',
            'items' => 'required|array',
            'total' => 'required|numeric',
            'subtotal' => 'nullable|numeric',
            'tax' => 'nullable|numeric',
            'discount' => 'nullable|numeric',
            'advance_applied_amount' => 'nullable|numeric|min:0',
            'status' => 'nullable|string',
            'payment_method' => 'nullable|string',
            'payment_terms' => 'nullable|string',
            'currency' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $invoiceTypeLower = strtolower((string) ($validated['invoice_type'] ?? 'full'));
        $orderId = $validated['order_id'] ?? null;

        if ($orderId) {
            $order = Order::find($orderId);
            if (!$order) {
                return response()->json(['message' => 'Invalid order_id.'], 422);
            }

            // Prevent over-invoicing (full+partial cannot exceed the order cap)
            if ($invoiceTypeLower !== 'advance') {
                $existingInvoiced = $this->existingInvoicedNet((int) $orderId);
                $newNet = $this->invoiceNetAmount(
                    (float) ($validated['total'] ?? 0),
                    (float) ($validated['tax'] ?? 0),
                    (float) ($validated['subtotal'] ?? 0)
                );
                $orderCap = $this->orderNetCap($order);
                if ($orderCap > 0 && ($existingInvoiced + $newNet) > ($orderCap + 0.0001)) {
                    $remaining = max(0, $orderCap - $existingInvoiced);
                    return response()->json([
                        'message' => $existingInvoiced > 0
                            ? 'This sales order already has an invoice. Remaining amount: ' . number_format($remaining, 2) . '.'
                            : 'Invoice total exceeds Sales Order total.',
                        'already_invoiced' => $existingInvoiced,
                        'remaining' => $remaining,
                    ], 422);
                }

                // Prevent over-application of advance for the same order (simple per-order advance policy)
                $availableAdvance = (float) SalesInvoice::where('order_id', $orderId)
                    ->where('status', '!=', 'Cancelled')
                    ->whereRaw("LOWER(COALESCE(invoice_type,'')) = 'advance'")
                    ->sum('paid_amount');

                $usedAdvance = (float) SalesInvoice::where('order_id', $orderId)
                    ->where('status', '!=', 'Cancelled')
                    ->whereRaw("LOWER(COALESCE(invoice_type,'')) != 'advance'")
                    ->sum('advance_applied_amount');

                $requestedAdvance = (float) ($validated['advance_applied_amount'] ?? 0);
                if (($usedAdvance + $requestedAdvance) > ($availableAdvance + 0.0001)) {
                    return response()->json([
                        'message' => 'Advance applied amount exceeds available advance for this order.',
                    ], 422);
                }
            } else {
                // Advance invoice itself should not have advance_applied_amount.
                $validated['advance_applied_amount'] = 0;
            }
        }

        $validated['created_by'] = Auth::user()->name ?? 'System';
        $invoice = SalesInvoice::create(array_merge($validated, [
            'paid_amount' => 0,
            'payment_status' => 'Unpaid',
            'balance_due' => max(0, (float) ($validated['total'] ?? 0) - (float) ($validated['advance_applied_amount'] ?? 0)),
        ]));
        $crm = \App\Models\CrmSetting::first();
        $settings = is_array($crm?->settings) ? $crm->settings : [];
        $rawStart = (string) ($settings['startInvoiceCode'] ?? '0001');
        $start = (int) $rawStart;
        $numberWidth = max(1, strlen(preg_replace('/\D/', '', $rawStart)));
        if (empty($invoice->invoice_number)) {
            $next = max($start, (int)$invoice->id);
            $invoice->invoice_number = 'INV-' . str_pad((string) $next, $numberWidth, '0', STR_PAD_LEFT);
            $invoice->save();
        }

        if (Auth::check()) {
            /** @var \App\Models\User $user */
            $user = Auth::user();

            $assignee = null;
            if (!empty($invoice->sales_person)) {
                $assignee = User::where('name', $invoice->sales_person)->first();
            }

            $baseUser = $assignee ?: $user;
            $notification = new InvoiceCreated($invoice, $user->name);

            $recipients = $this->buildNotificationRecipients(
                $baseUser,
                [
                    'owner' => $user,
                    'assignee' => $assignee,
                    'assigner' => $user,
                ],
                'customers',
                'notify_create_invoice'
            );

            foreach ($recipients as $recipient) {
                try {
                    $recipient->notify($notification);
                } catch (\Throwable $e) {
                }
            }
        }

        if ($this->isPostedLike($invoice->status)) {
            try {
                app(ItemStockService::class)->applyInvoiceSold($invoice);
            } catch (ValidationException $e) {
                $invoice->delete();
                return response()->json([
                    'message' => collect($e->errors())->flatten()->first() ?: 'Insufficient stock for this invoice.',
                    'errors' => $e->errors(),
                ], 422);
            }
        }

        return response()->json($invoice->fresh(), 201);
    }

    /**
     * Display the specified resource.
     */
    public function show(SalesInvoice $salesInvoice)
    {
        return $salesInvoice->load([
            'order:id,uuid',
            'customer:id,name,email',
        ]);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, SalesInvoice $salesInvoice)
    {
        $validated = $request->validate([
            'customer_id' => 'nullable|exists:customers,id',
            'customer_name' => 'sometimes|string',
            'customer_code' => 'nullable|string',
            'customer_address' => 'nullable|string',
            'sales_person' => 'nullable|string',
            'order_id' => 'nullable|exists:orders,id',
            'invoice_type' => 'nullable|string',
            'issue_date' => 'sometimes|date',
            'due_date' => 'nullable|date',
            'items' => 'sometimes|array',
            'total' => 'sometimes|numeric',
            'subtotal' => 'nullable|numeric',
            'tax' => 'nullable|numeric',
            'discount' => 'nullable|numeric',
            'advance_applied_amount' => 'nullable|numeric|min:0',
            'status' => 'nullable|string',
            'payment_method' => 'nullable|string',
            'payment_terms' => 'nullable|string',
            'currency' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $invoiceTypeLower = strtolower((string) ($validated['invoice_type'] ?? $salesInvoice->invoice_type ?? 'full'));
        $orderId = $validated['order_id'] ?? $salesInvoice->order_id ?? null;

        if ($orderId) {
            $order = Order::find($orderId);
            if (!$order) {
                return response()->json(['message' => 'Invalid order_id.'], 422);
            }

            if ($invoiceTypeLower !== 'advance') {
                $existingInvoiced = $this->existingInvoicedNet((int) $orderId, (int) $salesInvoice->id);
                $newNet = $this->invoiceNetAmount(
                    (float) ($validated['total'] ?? $salesInvoice->total ?? 0),
                    (float) ($validated['tax'] ?? $salesInvoice->tax ?? 0),
                    (float) ($validated['subtotal'] ?? $salesInvoice->subtotal ?? 0)
                );
                $orderCap = $this->orderNetCap($order);
                if ($orderCap > 0 && ($existingInvoiced + $newNet) > ($orderCap + 0.0001)) {
                    return response()->json([
                        'message' => 'Invoice total exceeds Sales Order total.',
                    ], 422);
                }

                $availableAdvance = (float) SalesInvoice::where('order_id', $orderId)
                    ->where('status', '!=', 'Cancelled')
                    ->whereRaw("LOWER(COALESCE(invoice_type,'')) = 'advance'")
                    ->sum('paid_amount');

                $usedAdvance = (float) SalesInvoice::where('order_id', $orderId)
                    ->where('id', '!=', $salesInvoice->id)
                    ->where('status', '!=', 'Cancelled')
                    ->whereRaw("LOWER(COALESCE(invoice_type,'')) != 'advance'")
                    ->sum('advance_applied_amount');

                $requestedAdvance = (float) ($validated['advance_applied_amount'] ?? $salesInvoice->advance_applied_amount ?? 0);
                if (($usedAdvance + $requestedAdvance) > ($availableAdvance + 0.0001)) {
                    return response()->json([
                        'message' => 'Advance applied amount exceeds available advance for this order.',
                    ], 422);
                }
            } else {
                $validated['advance_applied_amount'] = 0;
            }
        }

        $previousStatus = (string) $salesInvoice->status;
        $salesInvoice->update($validated);
        $this->recalculateInvoiceFinancials($salesInvoice);
        $salesInvoice = $salesInvoice->fresh();

        $stock = app(ItemStockService::class);
        if (!$this->isPostedLike($previousStatus) && $this->isPostedLike($salesInvoice->status)) {
            try {
                $stock->applyInvoiceSold($salesInvoice);
            } catch (ValidationException $e) {
                return response()->json([
                    'message' => collect($e->errors())->flatten()->first() ?: 'Insufficient stock for this invoice.',
                    'errors' => $e->errors(),
                ], 422);
            }
        }
        if (!$this->isCancelledLike($previousStatus) && $this->isCancelledLike($salesInvoice->status) && $this->isPostedLike($previousStatus)) {
            $stock->reverseInvoiceSold($salesInvoice, 'invoice_cancelled');
        }

        return response()->json($salesInvoice->fresh());
    }

    public function payments(SalesInvoice $salesInvoice)
    {
        $payments = $salesInvoice->payments()->latest('payment_date')->get();
        return response()->json([
            'data' => $payments,
        ]);
    }

    public function storePayment(Request $request, SalesInvoice $salesInvoice)
    {
        $validated = $request->validate([
            'payment_date' => 'required|date',
            'amount' => 'required|numeric|min:0.01',
            'payment_method' => 'nullable|string',
            'reference' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($validated, $salesInvoice) {
            $currentDue = max(0, (float) ($salesInvoice->total ?? 0) - (float) ($salesInvoice->advance_applied_amount ?? 0) - (float) ($salesInvoice->paid_amount ?? 0));
            if ((float) $validated['amount'] > $currentDue + 0.0001) {
                return response()->json([
                    'message' => 'Payment amount cannot exceed balance due.',
                ], 422);
            }

            $payment = SalesInvoicePayment::create([
                'sales_invoice_id' => $salesInvoice->id,
                'payment_date' => $validated['payment_date'],
                'amount' => $validated['amount'],
                'payment_method' => $validated['payment_method'] ?? null,
                'reference' => $validated['reference'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'status' => 'confirmed',
                'created_by' => Auth::user()->name ?? 'System',
            ]);

            $invoice = $this->recalculateInvoiceFinancials($salesInvoice->fresh());

            return response()->json([
                'payment' => $payment,
                'invoice' => $invoice,
            ], 201);
        });
    }

    public function storeReturn(Request $request, SalesInvoice $salesInvoice)
    {
        $validated = $request->validate([
            'items' => 'required|array|min:1',
            'items.*.item_id' => 'nullable',
            'items.*.name' => 'nullable|string',
            'items.*.quantity' => 'required|integer|min:1',
        ]);

        try {
            $applied = app(ItemStockService::class)->returnInvoiceItems($salesInvoice, $validated['items']);
        } catch (ValidationException $e) {
            return response()->json([
                'message' => collect($e->errors())->flatten()->first(),
                'errors' => $e->errors(),
            ], 422);
        }

        return response()->json([
            'message' => 'Return recorded successfully',
            'returned' => $applied,
            'invoice' => $salesInvoice->fresh(),
        ]);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(SalesInvoice $salesInvoice)
    {
        if ($this->isPostedLike($salesInvoice->status)) {
            app(ItemStockService::class)->reverseInvoiceSold($salesInvoice, 'invoice_deleted');
        }
        $salesInvoice->delete();
        return response()->noContent();
    }
}
