<?php

namespace App\Http\Controllers\ContractCollections;

use App\Models\CcCustomerUnit;
use Illuminate\Http\Request;
use Spatie\Activitylog\Models\Activity;

class CcAuditController extends BaseCcController
{
    public function customerUnit(Request $request, int $id)
    {
        $this->requireCcPermission($request, 'showModule');

        $tenantId = $this->tenantId($request);
        $unit = CcCustomerUnit::where('tenant_id', $tenantId)->findOrFail($id);

        $q = trim((string) $request->query('q', ''));
        $perPage = (int) $request->query('per_page', 50);
        if ($perPage <= 0) $perPage = 50;
        if ($perPage > 200) $perPage = 200;

        $query = Activity::query()
            ->where('tenant_id', $tenantId)
            ->where('subject_type', CcCustomerUnit::class)
            ->where('subject_id', $unit->id)
            ->with(['causer:id,name'])
            ->orderByDesc('id');

        if ($q !== '') {
            $query->where(function ($sub) use ($q) {
                $sub->where('description', 'like', "%{$q}%")
                    ->orWhere('log_name', 'like', "%{$q}%");
            });
        }

        $logs = $query->paginate($perPage);

        $mapped = $logs->getCollection()->map(function (Activity $a) {
            $props = $a->properties;
            if (is_string($props)) {
                $decoded = json_decode($props, true);
                $props = is_array($decoded) ? $decoded : [];
            } elseif (!is_array($props)) {
                $props = (array) $props;
            }

            return [
                'id' => (int) $a->id,
                'log_name' => (string) ($a->log_name ?? ''),
                'description' => (string) ($a->description ?? ''),
                'event' => (string) ($a->event ?? ''),
                'causer' => [
                    'id' => $a->causer_id ? (int) $a->causer_id : null,
                    'name' => $a->causer?->name ?? 'System',
                ],
                'properties' => $props,
                'created_at' => $a->created_at ? $a->created_at->toDateTimeString() : null,
            ];
        });

        $logs->setCollection($mapped);

        return response()->json($logs);
    }
}

