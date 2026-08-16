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
            $item = Item::query()->find($itemId);
            if (!$item) {
                throw ValidationException::withMessages([
                    'item' => "Item #{$itemId} was not found.",
                ]);
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

        $meta = is_array($request->meta_data) ? $request->meta_data : [];
        $meta['stock'] = [
            'item_id' => (int) $item->id,
            'quantity' => $qty,
            'state' => self::STATE_RESERVED,
            'reserved_expires_at' => $expiresAt ? $expiresAt->format('Y-m-d H:i:s') : null,
            'frozen' => false,
        ];
        $request->meta_data = $meta;
        $request->save();
    }

    public function freezeRequest(InventoryRequest $request): void
    {
        $meta = is_array($request->meta_data) ? $request->meta_data : [];
        $stock = is_array($meta['stock'] ?? null) ? $meta['stock'] : [];
        if (($stock['state'] ?? '') !== self::STATE_RESERVED) {
            return;
        }
        $stock['frozen'] = true;
        $stock['reserved_expires_at'] = null;
        $meta['stock'] = $stock;
        $request->meta_data = $meta;
        $request->save();
    }

    public function releaseRequest(InventoryRequest $request, string $reason = 'released'): void
    {
        $meta = is_array($request->meta_data) ? $request->meta_data : [];
        $stock = is_array($meta['stock'] ?? null) ? $meta['stock'] : [];
        $state = (string) ($stock['state'] ?? '');
        $qty = (int) ($stock['quantity'] ?? $request->quantity ?? 0);
        $itemId = (int) ($stock['item_id'] ?? 0);

        if ($qty < 1 || $itemId < 1) {
            return;
        }

        if ($state !== self::STATE_RESERVED) {
            return;
        }

        $item = Item::query()->find($itemId);
        if ($item) {
            $this->release($item, $qty, 'inventory_request', (int) $request->id, ['reason' => $reason]);
        }

        $stock['state'] = $reason === 'expired' ? self::STATE_EXPIRED : self::STATE_RELEASED;
        $stock['frozen'] = false;
        $meta['stock'] = $stock;
        $request->meta_data = $meta;
        $request->save();
    }

    public function sellRequest(InventoryRequest $request, string $sourceType = 'sales_invoice', ?int $sourceId = null): void
    {
        $meta = is_array($request->meta_data) ? $request->meta_data : [];
        $stock = is_array($meta['stock'] ?? null) ? $meta['stock'] : [];
        $state = (string) ($stock['state'] ?? '');
        $qty = (int) ($stock['quantity'] ?? $request->quantity ?? 0);
        $itemId = (int) ($stock['item_id'] ?? 0);

        if ($qty < 1 || $itemId < 1 || $state === self::STATE_SOLD) {
            return;
        }

        $item = Item::query()->find($itemId);
        if (!$item) {
            return;
        }

        if ($state === self::STATE_RESERVED) {
            $this->sellFromReserved($item, $qty, $sourceType, $sourceId);
        } else {
            $this->sellFromAvailable($item, $qty, $sourceType, $sourceId);
        }

        $stock['state'] = self::STATE_SOLD;
        $stock['frozen'] = true;
        $meta['stock'] = $stock;
        $request->meta_data = $meta;
        $request->save();
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
        $status = strtolower((string) ($invoice->status ?? ''));
        if (!in_array($status, ['posted', 'paid', 'partial', 'unpaid'], true)) {
            throw ValidationException::withMessages([
                'status' => 'Returns are allowed only on posted invoices.',
            ]);
        }

        $meta = is_array($invoice->meta_data) ? $invoice->meta_data : [];
        $returned = is_array($meta['returned_quantities'] ?? null) ? $meta['returned_quantities'] : [];
        $applied = [];

        foreach ($lines as $line) {
            $qty = max(0, (int) ($line['quantity'] ?? 0));
            if ($qty < 1) {
                continue;
            }

            $item = $this->resolveItemFromLine($line);
            if (!$item) {
                throw ValidationException::withMessages([
                    'item' => 'Return item was not found.',
                ]);
            }

            $invoicedQty = $this->invoicedQuantityForItem($invoice, $item);
            $already = (int) ($returned[(string) $item->id] ?? 0);
            if ($already + $qty > $invoicedQty) {
                throw ValidationException::withMessages([
                    'quantity' => "Return quantity for {$item->name} exceeds invoiced quantity.",
                ]);
            }

            $this->returnSold($item, $qty, 'sales_invoice_return', (int) $invoice->id);
            $returned[(string) $item->id] = $already + $qty;
            $applied[] = [
                'item_id' => $item->id,
                'name' => $item->name,
                'quantity' => $qty,
            ];
        }

        $meta['returned_quantities'] = $returned;
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
        foreach ($items as $row) {
            $row = is_array($row) ? $row : (array) $row;
            $qty = (int) ($row['quantity'] ?? $row['qty'] ?? 0);
            if ($qty < 1) {
                continue;
            }
            $item = $this->resolveItemFromLine($row);
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

    private function resolveItemFromLine(array $line): ?Item
    {
        $itemId = (int) ($line['item_id'] ?? $line['itemId'] ?? $line['item'] ?? $line['product_id'] ?? 0);
        if ($itemId > 0) {
            $found = Item::query()->find($itemId);
            if ($found) {
                return $found;
            }
        }

        $name = trim((string) ($line['name'] ?? $line['item_name'] ?? $line['product_name'] ?? $line['product'] ?? ''));
        if ($name === '') {
            return null;
        }

        return Item::query()->where('name', $name)->first();
    }
}
