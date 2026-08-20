<?php

namespace App\Services;

use App\Models\InventoryRequest;
use App\Models\Item;
use App\Models\ItemStockMovement;
use App\Models\Quotation;
use App\Models\SalesInvoice;
use App\Models\User;
use App\Notifications\SystemNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class ItemStockService
{
    public const STATE_AVAILABLE = 'available';
    public const STATE_RESERVED = 'reserved';
    public const STATE_SOLD = 'sold';
    public const STATE_RELEASED = 'released';
    public const STATE_EXPIRED = 'expired';

    public function availableOf(Item $item): int
    {
        return max(0, (int) ($item->quantity ?? 0));
    }

    public function reservedOf(Item $item): int
    {
        return max(0, (int) ($item->reserved_quantity ?? 0));
    }

    public function soldOf(Item $item): int
    {
        return max(0, (int) ($item->sold_quantity ?? 0));
    }

    public function assertCanReserve(array $rows): void
    {
        $needed = [];
        foreach ($rows as $row) {
            $itemId = (int) ($row['item'] ?? $row['item_id'] ?? 0);
            $qty = max(0, (int) ($row['quantity'] ?? 1));
            if ($itemId < 1 || $qty < 1) {
                continue;
            }
            $needed[$itemId] = ($needed[$itemId] ?? 0) + $qty;
        }

        foreach ($needed as $itemId => $qty) {
            $item = Item::query()->with('category')->find($itemId);
            if (!$item) {
                throw ValidationException::withMessages([
                    'item' => "Item #{$itemId} was not found.",
                ]);
            }
            if (($item->business_type ?? 'product') === 'service') {
                continue;
            }
            if ($this->availableOf($item) < $qty) {
                throw ValidationException::withMessages([
                    'quantity' => "Item {$item->name} does not have enough available quantity ({$this->availableOf($item)} available, {$qty} requested).",
                ]);
            }
        }
    }

    public function reserve(Item $item, int $qty, string $sourceType, ?int $sourceId = null, array $meta = []): Item
    {
        return $this->move($item, $qty, self::STATE_AVAILABLE, self::STATE_RESERVED, $sourceType, $sourceId, $meta);
    }

    public function release(Item $item, int $qty, string $sourceType, ?int $sourceId = null, array $meta = []): Item
    {
        return $this->move($item, $qty, self::STATE_RESERVED, self::STATE_AVAILABLE, $sourceType, $sourceId, $meta);
    }

    public function sellFromReserved(Item $item, int $qty, string $sourceType, ?int $sourceId = null, array $meta = []): Item
    {
        return $this->move($item, $qty, self::STATE_RESERVED, self::STATE_SOLD, $sourceType, $sourceId, $meta);
    }

    public function sellFromAvailable(Item $item, int $qty, string $sourceType, ?int $sourceId = null, array $meta = []): Item
    {
        return $this->move($item, $qty, self::STATE_AVAILABLE, self::STATE_SOLD, $sourceType, $sourceId, $meta);
    }

    public function returnSold(Item $item, int $qty, string $sourceType, ?int $sourceId = null, array $meta = []): Item
    {
        return $this->move($item, $qty, self::STATE_SOLD, self::STATE_AVAILABLE, $sourceType, $sourceId, $meta);
    }

    public function reserveForRequest(InventoryRequest $request, Item $item, int $qty, ?\DateTimeInterface $expiresAt = null): void
    {
        $this->reserve($item, $qty, 'inventory_request', (int) $request->id, [
            'product' => $item->name,
        ]);

        $this->appendStockLine($request, [
            'item_id' => (int) $item->id,
            'quantity' => $qty,
            'state' => self::STATE_RESERVED,
            'reserved_expires_at' => $expiresAt ? $expiresAt->format('Y-m-d H:i:s') : null,
            'frozen' => false,
        ]);
    }

    public function markSoldFromAvailableForRequest(
        InventoryRequest $request,
        Item $item,
        int $qty,
        string $sourceType = 'lead_action',
        ?int $sourceId = null
    ): void {
        $this->sellFromAvailable($item, $qty, $sourceType, $sourceId);
        $this->appendStockLine($request, [
            'item_id' => (int) $item->id,
            'quantity' => $qty,
            'state' => self::STATE_SOLD,
            'reserved_expires_at' => null,
            'frozen' => true,
        ]);
    }

    public function freezeRequest(InventoryRequest $request): void
    {
        $meta = is_array($request->meta_data) ? $request->meta_data : [];
        $lines = $this->stockLinesFromMeta($meta);
        if ($lines === []) {
            return;
        }

        $changed = false;
        foreach ($lines as $index => $stock) {
            if (($stock['state'] ?? '') !== self::STATE_RESERVED) {
                continue;
            }
            $stock['frozen'] = true;
            $stock['reserved_expires_at'] = null;
            $lines[$index] = $stock;
            $changed = true;
        }

        if ($changed) {
            $this->writeStockLines($request, $meta, $lines);
        }
    }

    public function releaseRequest(InventoryRequest $request, string $reason = 'released'): void
    {
        $meta = is_array($request->meta_data) ? $request->meta_data : [];
        $lines = $this->stockLinesFromMeta($meta);
        if ($lines === []) {
            return;
        }

        $changed = false;
        foreach ($lines as $index => $stock) {
            $state = (string) ($stock['state'] ?? '');
            $qty = (int) ($stock['quantity'] ?? 0);
            $itemId = (int) ($stock['item_id'] ?? 0);

            if ($qty < 1 || $itemId < 1 || $state !== self::STATE_RESERVED) {
                continue;
            }

            $item = Item::query()->find($itemId);
            if ($item) {
                $this->release($item, $qty, 'inventory_request', (int) $request->id, ['reason' => $reason]);
            }

            $stock['state'] = $reason === 'expired' ? self::STATE_EXPIRED : self::STATE_RELEASED;
            $stock['frozen'] = false;
            $lines[$index] = $stock;
            $changed = true;
        }

        if ($changed) {
            $this->writeStockLines($request, $meta, $lines);
        }
    }

    public function sellRequest(InventoryRequest $request, string $sourceType = 'sales_invoice', ?int $sourceId = null): void
    {
        $meta = is_array($request->meta_data) ? $request->meta_data : [];
        $lines = $this->stockLinesFromMeta($meta);
        if ($lines === []) {
            return;
        }

        $changed = false;
        foreach ($lines as $index => $stock) {
            $state = (string) ($stock['state'] ?? '');
            $qty = (int) ($stock['quantity'] ?? 0);
            $itemId = (int) ($stock['item_id'] ?? 0);

            if ($qty < 1 || $itemId < 1 || $state === self::STATE_SOLD) {
                continue;
            }

            $item = Item::query()->find($itemId);
            if (! $item) {
                continue;
            }

            if ($state === self::STATE_RESERVED) {
                $this->sellFromReserved($item, $qty, $sourceType, $sourceId);
            } else {
                $this->sellFromAvailable($item, $qty, $sourceType, $sourceId);
            }

            $stock['state'] = self::STATE_SOLD;
            $stock['frozen'] = true;
            $lines[$index] = $stock;
            $changed = true;
        }

        if ($changed) {
            $this->writeStockLines($request, $meta, $lines);
        }
    }

    public function expireDueRequests(): int
    {
        $count = 0;
        $requests = InventoryRequest::withoutGlobalScope('tenant')
            ->whereNotIn('status', ['Converted', 'Rejected', 'Expired'])
            ->get();

        foreach ($requests as $request) {
            $meta = is_array($request->meta_data) ? $request->meta_data : [];
            $stock = is_array($meta['stock'] ?? null) ? $meta['stock'] : [];
            if (($stock['state'] ?? '') !== self::STATE_RESERVED) {
                continue;
            }
            if (!empty($stock['frozen'])) {
                continue;
            }
            $expiresAt = $stock['reserved_expires_at'] ?? null;
            if (!$expiresAt || now()->lt($expiresAt)) {
                continue;
            }

            $this->releaseRequest($request, 'expired');
            $request->status = 'Expired';
            $request->save();
            $count++;
        }

        return $count;
    }

    public function releaseQuotation(Quotation $quotation): void
    {
        $meta = is_array($quotation->meta_data) ? $quotation->meta_data : [];
        if (!empty($meta['stock_released'])) {
            return;
        }

        $requestId = (int) ($meta['converted_from_request_id'] ?? 0);
        if ($requestId > 0) {
            $request = InventoryRequest::query()->find($requestId);
            if ($request) {
                $this->releaseRequest($request, 'quotation_cancelled');
                if (strcasecmp((string) $request->status, 'Converted') === 0) {
                    $request->status = 'Approved';
                    $request->save();
                }
            }
        }

        $meta['stock_released'] = true;
        $quotation->meta_data = $meta;
        $quotation->save();
    }

    public function applyInvoiceSold(SalesInvoice $invoice): void
    {
        $meta = is_array($invoice->meta_data) ? $invoice->meta_data : [];
        if (!empty($meta['stock_applied'])) {
            return;
        }

        $request = $this->resolveRequestForInvoice($invoice);
        if ($request) {
            $this->sellRequest($request, 'sales_invoice', (int) $invoice->id);
            $meta['stock_applied'] = true;
            $meta['stock_request_id'] = (int) $request->id;
            $invoice->meta_data = $meta;
            $invoice->save();
            return;
        }

        foreach ($this->invoiceStockLines($invoice) as $line) {
            $item = $line['item'];
            $qty = $line['quantity'];
            $this->sellFromAvailable($item, $qty, 'sales_invoice', (int) $invoice->id);
        }

        $meta['stock_applied'] = true;
        $invoice->meta_data = $meta;
        $invoice->save();
    }

    public function reverseInvoiceSold(SalesInvoice $invoice, string $reason = 'invoice_cancelled'): void
    {
        $meta = is_array($invoice->meta_data) ? $invoice->meta_data : [];
        if (empty($meta['stock_applied']) || !empty($meta['stock_reversed'])) {
            return;
        }

        $requestId = (int) ($meta['stock_request_id'] ?? 0);
        if ($requestId > 0) {
            $request = InventoryRequest::query()->find($requestId);
            $stock = is_array(($request?->meta_data['stock'] ?? null)) ? $request->meta_data['stock'] : [];
            $qty = (int) ($stock['quantity'] ?? 0);
            $itemId = (int) ($stock['item_id'] ?? 0);
            $item = $itemId ? Item::query()->find($itemId) : null;
            if ($item && $qty > 0 && ($stock['state'] ?? '') === self::STATE_SOLD) {
                $this->returnSold($item, $qty, 'sales_invoice', (int) $invoice->id, ['reason' => $reason]);
                $stock['state'] = self::STATE_RELEASED;
                $metaData = is_array($request->meta_data) ? $request->meta_data : [];
                $metaData['stock'] = $stock;
                $request->meta_data = $metaData;
                $request->save();
            }
        } else {
            foreach ($this->invoiceStockLines($invoice) as $line) {
                $alreadyReturned = (int) (($meta['returned_quantities'][$line['item']->id] ?? 0));
                $qty = max(0, $line['quantity'] - $alreadyReturned);
                if ($qty > 0) {
                    $this->returnSold($line['item'], $qty, 'sales_invoice', (int) $invoice->id, ['reason' => $reason]);
                }
            }
        }

        $meta['stock_reversed'] = true;
        $invoice->meta_data = $meta;
        $invoice->save();
    }

    public function returnInvoiceItems(SalesInvoice $invoice, array $lines): array
    {
        $status = strtolower(trim((string) ($invoice->status ?? '')));
        $allowed = ['posted', 'paid', 'partial', 'partially paid', 'unpaid', 'overdue'];
        if (!in_array($status, $allowed, true)) {
            throw ValidationException::withMessages([
                'status' => 'Refunds are allowed only on posted invoices.',
            ]);
        }

        $meta = is_array($invoice->meta_data) ? $invoice->meta_data : [];
        if (!empty($meta['stock_reversed'])) {
            throw ValidationException::withMessages([
                'status' => 'Stock for this invoice was already fully reversed.',
            ]);
        }

        $returned = is_array($meta['returned_quantities'] ?? null) ? $meta['returned_quantities'] : [];
        $applied = [];
        $tenantId = (int) ($invoice->tenant_id ?? 0) ?: null;

        foreach ($lines as $line) {
            $line = is_array($line) ? $line : (array) $line;
            $qty = max(0, (int) ($line['quantity'] ?? 0));
            if ($qty < 1) {
                continue;
            }

            $item = $this->resolveItemFromLine($line, $tenantId);
            if (!$item) {
                $label = trim((string) ($line['name'] ?? $line['item_id'] ?? 'item'));
                throw ValidationException::withMessages([
                    'item' => "Refund item was not found: {$label}. Ensure invoice lines include a catalog item.",
                ]);
            }

            $invoicedQty = $this->invoicedQuantityForItem($invoice, $item);
            if ($invoicedQty < 1) {
                throw ValidationException::withMessages([
                    'item' => "Item {$item->name} is not on this invoice (or has no resolvable stock line).",
                ]);
            }

            $already = (int) ($returned[(string) $item->id] ?? $returned[$item->id] ?? 0);
            if ($already + $qty > $invoicedQty) {
                throw ValidationException::withMessages([
                    'quantity' => "Refund quantity for {$item->name} exceeds invoiced quantity ({$invoicedQty}).",
                ]);
            }

            try {
                $this->returnSold($item, $qty, 'sales_invoice_return', (int) $invoice->id);
            } catch (ValidationException $e) {
                $sold = $this->soldOf($item);
                throw ValidationException::withMessages([
                    'quantity' => "Cannot refund {$item->name}: only {$sold} sold in stock (requested {$qty}). Post the invoice so stock is sold first.",
                ]);
            }

            $returned[(string) $item->id] = $already + $qty;
            $applied[] = [
                'item_id' => $item->id,
                'name' => $item->name,
                'quantity' => $qty,
            ];
        }

        $meta['returned_quantities'] = $returned;

        // Persist resolved catalog ids on invoice lines so later refunds match reliably.
        $invoiceItems = is_array($invoice->items) ? $invoice->items : [];
        $patched = false;
        foreach ($applied as $row) {
            $appliedId = (int) ($row['item_id'] ?? 0);
            $appliedName = trim((string) ($row['name'] ?? ''));
            if ($appliedId < 1) {
                continue;
            }
            foreach ($invoiceItems as $i => $line) {
                $line = is_array($line) ? $line : (array) $line;
                $lid = (int) ($line['item_id'] ?? $line['itemId'] ?? $line['product_id'] ?? 0);
                $lname = trim((string) ($line['name'] ?? $line['item_name'] ?? $line['product_name'] ?? ''));
                if ($lid === $appliedId) {
                    continue;
                }
                if ($lid > 0) {
                    continue;
                }
                if ($appliedName !== '' && $lname !== '' && strcasecmp($lname, $appliedName) === 0) {
                    $line['item_id'] = $appliedId;
                    $invoiceItems[$i] = $line;
                    $patched = true;
                }
            }
        }
        if ($patched) {
            $invoice->items = $invoiceItems;
        }

        $invoice->meta_data = $meta;
        $invoice->save();

        return $applied;
    }

    private function move(
        Item $item,
        int $qty,
        string $from,
        string $to,
        string $sourceType,
        ?int $sourceId,
        array $meta = []
    ): Item {
        if ($qty < 1) {
            throw ValidationException::withMessages(['quantity' => 'Quantity must be at least 1.']);
        }

        return DB::transaction(function () use ($item, $qty, $from, $to, $sourceType, $sourceId, $meta) {
            /** @var Item $locked */
            $locked = Item::query()->whereKey($item->id)->lockForUpdate()->firstOrFail();

            $oldAvailable = $this->availableOf($locked);
            $available = $oldAvailable;
            $reserved = $this->reservedOf($locked);
            $sold = $this->soldOf($locked);

            if ($from === self::STATE_AVAILABLE && $available < $qty) {
                throw ValidationException::withMessages([
                    'quantity' => "Item {$locked->name} does not have enough available quantity.",
                ]);
            }
            if ($from === self::STATE_RESERVED && $reserved < $qty) {
                throw ValidationException::withMessages([
                    'quantity' => "Item {$locked->name} does not have enough reserved quantity.",
                ]);
            }
            if ($from === self::STATE_SOLD && $sold < $qty) {
                throw ValidationException::withMessages([
                    'quantity' => "Item {$locked->name} does not have enough sold quantity to return.",
                ]);
            }

            $available += $this->delta($from, $to, self::STATE_AVAILABLE, $qty);
            $reserved += $this->delta($from, $to, self::STATE_RESERVED, $qty);
            $sold += $this->delta($from, $to, self::STATE_SOLD, $qty);

            $locked->quantity = max(0, $available);
            $locked->reserved_quantity = max(0, $reserved);
            $locked->sold_quantity = max(0, $sold);
            $locked->save();

            ItemStockMovement::create([
                'tenant_id' => $locked->tenant_id,
                'item_id' => $locked->id,
                'quantity' => $qty,
                'from_state' => $from,
                'to_state' => $to,
                'source_type' => $sourceType,
                'source_id' => $sourceId,
                'meta' => $meta,
            ]);

            $fresh = $locked->fresh();
            if ($from === self::STATE_AVAILABLE) {
                $this->notifyIfMinimumReached($fresh, $oldAvailable);
            }

            return $fresh;
        });
    }

    private function notifyIfMinimumReached(Item $item, int $oldAvailable): void
    {
        $quantity = $this->availableOf($item);
        $minimum = (int) ($item->min_alert ?? 0);
        if ($minimum <= 0 || $quantity > $minimum || $oldAvailable <= $minimum) {
            return;
        }

        try {
            $recipients = User::query()
                ->where('tenant_id', $item->tenant_id)
                ->where(function ($query) {
                    $query->where('status', 'Active')->orWhereNull('status');
                })
                ->get()
                ->filter(fn (User $user) => $this->userShouldReceiveMinAlert($user))
                ->values();

            if ($recipients->isEmpty()) {
                return;
            }

            $title = 'Minimum quantity reached';
            $message = "Item {$item->name} reached the minimum quantity limit ({$quantity}/{$minimum}).";

            foreach ($recipients as $recipient) {
                $recipient->notify(new SystemNotification($title, $message, [
                    'module' => 'inventory',
                    'event' => 'minimum_quantity_reached',
                    'item_id' => $item->id,
                    'item_name' => $item->name,
                    'item_code' => $item->code ?? $item->sku,
                    'quantity' => $quantity,
                    'minimum_quantity' => $minimum,
                ]));
            }
        } catch (\Throwable $e) {
            Log::warning('Failed to send item minimum quantity notification', [
                'item_id' => $item->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function userShouldReceiveMinAlert(User $user): bool
    {
        if ($user->is_super_admin) {
            return true;
        }

        $role = strtolower(trim((string) ($user->role ?? $user->job_title ?? '')));
        if (in_array($role, ['admin', 'tenant admin', 'tenant-admin'], true)) {
            return true;
        }

        $meta = is_array($user->meta_data) ? $user->meta_data : [];
        $modulePermissions = $meta['module_permissions'] ?? [];
        if (!is_array($modulePermissions)) {
            return false;
        }

        foreach (['Customers', 'customers', 'Customer', 'customer', 'Inventory', 'inventory'] as $key) {
            if (!array_key_exists($key, $modulePermissions)) {
                continue;
            }
            $permissions = $modulePermissions[$key];
            if ($permissions === true || (is_array($permissions) && count($permissions) > 0)) {
                return true;
            }
        }

        return false;
    }

    private function delta(string $from, string $to, string $bucket, int $qty): int
    {
        $change = 0;
        if ($from === $bucket) {
            $change -= $qty;
        }
        if ($to === $bucket) {
            $change += $qty;
        }
        return $change;
    }

    private function resolveRequestForInvoice(SalesInvoice $invoice): ?InventoryRequest
    {
        $invoiceMeta = is_array($invoice->meta_data) ? $invoice->meta_data : [];
        $requestId = (int) ($invoiceMeta['converted_from_request_id'] ?? $invoiceMeta['stock_request_id'] ?? 0);
        if ($requestId > 0) {
            return InventoryRequest::query()->find($requestId);
        }

        if ($invoice->order_id) {
            $order = $invoice->order;
            $quotationId = $order?->quotation_id;
            if ($quotationId) {
                $quotation = Quotation::query()->find($quotationId)
                    ?: Quotation::query()->where('meta_data->quotation_code', $quotationId)->first();
                $qMeta = is_array($quotation?->meta_data) ? $quotation->meta_data : [];
                $fromRequest = (int) ($qMeta['converted_from_request_id'] ?? 0);
                if ($fromRequest > 0) {
                    return InventoryRequest::query()->find($fromRequest);
                }
            }
        }

        return null;
    }

    private function invoiceStockLines(SalesInvoice $invoice): array
    {
        $lines = [];
        $items = is_array($invoice->items) ? $invoice->items : [];
        $tenantId = (int) ($invoice->tenant_id ?? 0) ?: null;
        foreach ($items as $row) {
            $row = is_array($row) ? $row : (array) $row;
            $qty = (int) ($row['quantity'] ?? $row['qty'] ?? 0);
            if ($qty < 1) {
                continue;
            }
            $item = $this->resolveItemFromLine($row, $tenantId);
            if (!$item) {
                continue;
            }
            $lines[] = ['item' => $item, 'quantity' => $qty];
        }
        return $lines;
    }

    private function invoicedQuantityForItem(SalesInvoice $invoice, Item $item): int
    {
        $total = 0;
        foreach ($this->invoiceStockLines($invoice) as $line) {
            if ((int) $line['item']->id === (int) $item->id) {
                $total += (int) $line['quantity'];
            }
        }
        return $total;
    }

    private function resolveItemFromLine(array $line, ?int $tenantId = null): ?Item
    {
        $itemId = (int) ($line['item_id'] ?? $line['itemId'] ?? $line['item'] ?? $line['product_id'] ?? 0);
        if ($itemId > 0) {
            $q = Item::query()->whereKey($itemId);
            if ($tenantId) {
                $q->where('tenant_id', $tenantId);
            }
            $found = $q->first();
            if ($found) {
                return $found;
            }
        }

        $name = trim((string) ($line['name'] ?? $line['item_name'] ?? $line['product_name'] ?? $line['product'] ?? ''));
        if ($name === '') {
            return null;
        }

        $q = Item::query()->where('name', $name);
        if ($tenantId) {
            $q->where('tenant_id', $tenantId);
        }

        return $q->first();
    }

    /**
     * @param  array<string,mixed>  $meta
     * @return list<array<string,mixed>>
     */
    private function stockLinesFromMeta(array $meta): array
    {
        if (is_array($meta['stock_lines'] ?? null) && $meta['stock_lines'] !== []) {
            return array_values(array_filter(
                $meta['stock_lines'],
                fn ($line) => is_array($line) && (int) ($line['item_id'] ?? 0) > 0
            ));
        }

        $stock = is_array($meta['stock'] ?? null) ? $meta['stock'] : [];
        if ((int) ($stock['item_id'] ?? 0) > 0) {
            return [$stock];
        }

        return [];
    }

    /**
     * @param  array<string,mixed>  $line
     */
    private function appendStockLine(InventoryRequest $request, array $line): void
    {
        $meta = is_array($request->meta_data) ? $request->meta_data : [];
        $lines = $this->stockLinesFromMeta($meta);
        $lines[] = $line;
        $this->writeStockLines($request, $meta, $lines);
    }

    /**
     * @param  array<string,mixed>  $meta
     * @param  list<array<string,mixed>>  $lines
     */
    private function writeStockLines(InventoryRequest $request, array $meta, array $lines): void
    {
        $lines = array_values($lines);
        $meta['stock_lines'] = $lines;

        if (count($lines) === 1) {
            $meta['stock'] = $lines[0];
        } elseif (count($lines) > 1) {
            $states = array_map(fn (array $line) => (string) ($line['state'] ?? ''), $lines);
            $state = in_array(self::STATE_RESERVED, $states, true)
                ? self::STATE_RESERVED
                : (in_array(self::STATE_SOLD, $states, true) ? self::STATE_SOLD : ($states[0] ?? null));

            $meta['stock'] = [
                'state' => $state,
                'quantity' => array_sum(array_map(fn (array $line) => (int) ($line['quantity'] ?? 0), $lines)),
                'frozen' => collect($lines)->every(fn (array $line) => ! empty($line['frozen'])),
                'reserved_expires_at' => $lines[0]['reserved_expires_at'] ?? null,
                'multi' => true,
            ];
        }

        $request->meta_data = $meta;
        $request->save();
    }
}
