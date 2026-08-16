<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Item;
use App\Models\Revenue;
use App\Models\User;
use App\Traits\UserHierarchyTrait;

class RevenueController extends Controller
{
    use UserHierarchyTrait;

    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $query = Revenue::query()
            ->with(['user.manager', 'lead', 'action'])
            ->where('tenant_id', $user->tenant_id);

        $roleLower = strtolower($user->role ?? '');
        $isAdminOrManager = $user->is_super_admin || 
                            in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

        if (!$isAdminOrManager) {
            $viewableUserIds = $this->getViewableUserIds($user);
            if ($viewableUserIds !== null) {
                $query->whereIn('user_id', $viewableUserIds);
            } else {
                $query->where('user_id', $user->id);
            }
        }

        if ($request->has('user_id') && $request->user_id) {
            $query->where('user_id', $request->user_id);
        }

        if ($request->has('date_from')) {
            $query->whereDate('created_at', '>=', $request->date_from);
        }

        if ($request->has('date_to')) {
            $query->whereDate('created_at', '<=', $request->date_to);
        }

        $revenues = $query->latest()->get();
        $this->appendLeadItemNames($revenues);

        return response()->json($revenues);
    }

    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        $validated = $request->validate([
            'user_id' => 'nullable|exists:users,id',
            'lead_id' => 'nullable|exists:leads,id',
            'action_id' => 'nullable|exists:lead_actions,id',
            'amount' => 'required|numeric|min:0',
            'currency' => 'nullable|string|max:10',
            'source' => 'nullable|string|max:100',
            'meta_data' => 'nullable|array',
        ]);
        $payload = array_merge($validated, [
            'tenant_id' => $user->tenant_id,
            'currency' => $validated['currency'] ?? 'EGP',
        ]);
        $rev = Revenue::create($payload);
        return response()->json($rev, 201);
    }

    public function summary(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        $from = $request->input('date_from');
        $to = $request->input('date_to');
        $query = Revenue::query()->where('tenant_id', $user->tenant_id);
        if ($from) $query->whereDate('created_at', '>=', $from);
        if ($to) $query->whereDate('created_at', '<=', $to);
        if ($request->filled('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        $rows = $query
            ->selectRaw('user_id, COALESCE(SUM(amount),0) as total')
            ->groupBy('user_id')
            ->get();
        $userIds = $rows->pluck('user_id')->filter()->unique()->values();
        $users = User::whereIn('id', $userIds)->get(['id','name'])->keyBy('id');
        $data = $rows->map(function($r) use ($users) {
            return [
                'user_id' => $r->user_id,
                'user_name' => $r->user_id ? ($users[$r->user_id]->name ?? null) : null,
                'total' => (float) $r->total,
            ];
        });
        return response()->json(['data' => $data]);
    }

    private function appendLeadItemNames($revenues): void
    {
        $itemIds = collect($revenues)
            ->flatMap(function ($revenue) {
                $ids = [];
                $leadId = $revenue->lead?->item_id;
                if (!empty($leadId)) {
                    $ids[] = (int) $leadId;
                }
                $details = is_array($revenue->action?->details) ? $revenue->action->details : [];
                $ids = array_merge($ids, $this->collectDetailsItemIds($details));
                $meta = is_array($revenue->meta_data) ? $revenue->meta_data : [];
                foreach ($meta['deal_items'] ?? [] as $row) {
                    $id = $row['item_id'] ?? $row['item'] ?? null;
                    if (is_numeric($id) && (int) $id > 0) {
                        $ids[] = (int) $id;
                    }
                }
                return $ids;
            })
            ->filter()
            ->unique()
            ->values();

        $itemsById = collect();
        if ($itemIds->isNotEmpty()) {
            $itemSelect = ['id'];
            foreach (['name', 'product', 'title'] as $column) {
                if (\Illuminate\Support\Facades\Schema::hasColumn('items', $column)) {
                    $itemSelect[] = $column;
                }
            }

            $itemsById = Item::query()
                ->whereIn('id', $itemIds)
                ->get($itemSelect)
                ->keyBy('id');
        }

        foreach ($revenues as $revenue) {
            $dealItems = $this->resolveDealItems($revenue, $itemsById);
            $itemName = collect($dealItems)
                ->pluck('name')
                ->filter()
                ->unique()
                ->implode(', ');

            if ($itemName !== '') {
                $revenue->setAttribute('item_name', $itemName);
            }
            $revenue->setAttribute('deal_items', $dealItems);
        }
    }

    private function collectDetailsItemIds(array $details): array
    {
        $ids = [];
        foreach (['reservationItem', 'item_id', 'item'] as $key) {
            $value = $details[$key] ?? null;
            if (is_numeric($value) && (int) $value > 0) {
                $ids[] = (int) $value;
            }
        }
        foreach ($details['reservationGeneralItems'] ?? [] as $row) {
            if (!is_array($row)) {
                continue;
            }
            $id = $row['item'] ?? $row['item_id'] ?? null;
            if (is_numeric($id) && (int) $id > 0) {
                $ids[] = (int) $id;
            }
        }
        return $ids;
    }

    private function resolveDealItems($revenue, $itemsById): array
    {
        $meta = is_array($revenue->meta_data) ? $revenue->meta_data : [];
        $fromMeta = $this->normalizeDealItems($meta['deal_items'] ?? [], $itemsById);
        if (!empty($fromMeta)) {
            return $fromMeta;
        }

        $details = is_array($revenue->action?->details) ? $revenue->action->details : [];
        $fromAction = $this->normalizeDealItems($details['reservationGeneralItems'] ?? [], $itemsById);
        if (!empty($fromAction)) {
            return $fromAction;
        }

        $singleName = $this->itemNameFromId($details['reservationItem'] ?? $details['item_id'] ?? null, $itemsById)
            ?: trim((string) ($details['item_name'] ?? $details['product'] ?? ''));
        if ($singleName !== '') {
            return [[
                'name' => $singleName,
                'amount' => (float) ($revenue->amount ?? 0),
            ]];
        }

        $lead = $revenue->lead;
        if (!$lead) {
            return [];
        }

        $leadName = trim((string) ($lead->item_name ?? ''));
        if ($leadName === '') {
            $leadMeta = is_array($lead->meta_data) ? $lead->meta_data : [];
            $leadName = trim((string) ($leadMeta['lead_item_name'] ?? $leadMeta['item_name'] ?? ''));
        }
        if ($leadName === '') {
            $rawItem = $lead->getAttributes()['item'] ?? null;
            if (is_string($rawItem) && $rawItem !== '' && !ctype_digit($rawItem)) {
                $leadName = trim($rawItem);
            }
        }
        if ($leadName === '' && !empty($lead->item_id)) {
            $leadName = $this->itemNameFromId($lead->item_id, $itemsById);
        }
        if ($leadName === '') {
            return [];
        }

        return [[
            'name' => $leadName,
            'amount' => (float) ($revenue->amount ?? 0),
        ]];
    }

    private function normalizeDealItems($rows, $itemsById): array
    {
        if (!is_array($rows)) {
            return [];
        }

        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $id = $row['item'] ?? $row['item_id'] ?? null;
            $name = trim((string) ($row['item_name'] ?? $row['name'] ?? $row['label'] ?? ''));
            if ($name === '') {
                $name = $this->itemNameFromId($id, $itemsById);
            }
            if ($name === '') {
                continue;
            }
            $items[] = [
                'name' => $name,
                'amount' => (float) ($row['line_total'] ?? $row['total'] ?? $row['sub_total'] ?? $row['amount'] ?? $row['revenue'] ?? 0),
            ];
        }

        return $items;
    }

    private function itemNameFromId($id, $itemsById): string
    {
        if (!is_numeric($id) || (int) $id <= 0) {
            return '';
        }
        $item = $itemsById->get((int) $id);
        return trim((string) ($item?->name ?? $item?->product ?? $item?->title ?? ''));
    }
}

