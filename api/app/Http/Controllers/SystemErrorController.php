<?php

namespace App\Http\Controllers;

use App\Models\SystemError;
use App\Models\Tenant;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;

class SystemErrorController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->input('per_page', 25), 1), 100);
        $launchStartAt = $this->resolveLaunchStartAt();

        $errorsQuery = $this->applyFilters(SystemError::query()->with('tenant'), $request);

        $errors = $errorsQuery
            ->orderByDesc('last_seen_at')
            ->orderByDesc('id')
            ->paginate($perPage);

        $statsQuery = $this->applyFilters(SystemError::query(), $request, [
            'ignore_resolution_status' => true,
            'force_last_24_hours' => true,
        ]);

        $oldestOpenQuery = $this->applyFilters(SystemError::query(), $request, [
            'ignore_resolution_status' => true,
        ])->whereNull('resolved_at');

        $formatted = $errors->getCollection()->map(function (SystemError $error) {
            $lastSeenAt = $error->last_seen_at ?? $error->updated_at;
            $createdAt = $error->created_at;

            return [
                'id' => $error->id,
                'tenant_id' => $error->tenant_id,
                'tenant' => $error->tenant?->name ?? 'System',
                'service' => $error->service,
                'endpoint' => $error->endpoint,
                'status' => $error->status,
                'level' => $error->level,
                'count' => $error->count,
                'message' => $error->message,
                'stack_trace' => $error->stack_trace,
                'fingerprint' => $error->fingerprint,
                'time' => $createdAt?->format('Y-m-d H:i'),
                'created_at' => $createdAt?->toIso8601String(),
                'created_at_human' => $createdAt?->diffForHumans(),
                'last_seen_at' => $lastSeenAt?->toIso8601String(),
                'last_seen_human' => $lastSeenAt?->diffForHumans(),
                'last_seen_short' => $lastSeenAt?->diffForHumans(null, true, true) ?? '-',
                'resolved_at' => $error->resolved_at?->toIso8601String(),
                'resolved_at_human' => $error->resolved_at?->diffForHumans(),
                'is_resolved' => (bool) $error->resolved_at,
            ];
        });

        $oldestOpen = $oldestOpenQuery->oldest('created_at')->first();
        $tenantIds = $this->applyFilters(
            SystemError::query()->whereNotNull('tenant_id'),
            $request,
            ['ignore_resolution_status' => true]
        )
            ->distinct()
            ->pluck('tenant_id');

        return response()->json([
            'data' => $formatted,
            'stats' => [
                'tenants_24h' => (clone $statsQuery)->whereNotNull('tenant_id')->distinct()->count('tenant_id'),
                'total_24h' => (int) ((clone $statsQuery)->sum('count') ?? 0),
                'error_incidents_24h' => (int) ((clone $statsQuery)->where('level', 'error')->sum('count') ?? 0),
                'oldest_open' => $oldestOpen?->created_at?->diffForHumans() ?? '-',
                'oldest_open_at' => $oldestOpen?->created_at?->toIso8601String(),
            ],
            'lookups' => [
                'levels' => ['error', 'warning'],
                'resolution_statuses' => ['open', 'resolved', 'all'],
                'tenants' => Tenant::query()
                    ->whereIn('id', $tenantIds)
                    ->orderBy('name')
                    ->get(['id', 'name'])
                    ->map(fn (Tenant $tenant) => ['id' => $tenant->id, 'name' => $tenant->name])
                    ->values(),
            ],
            'meta' => [
                'current_page' => $errors->currentPage(),
                'last_page' => $errors->lastPage(),
                'per_page' => $errors->perPage(),
                'total' => $errors->total(),
                'from' => $errors->firstItem(),
                'to' => $errors->lastItem(),
                'launch_start_at' => $launchStartAt?->toIso8601String(),
                'launch_start_at_display' => $launchStartAt?->format('Y-m-d H:i'),
            ],
        ]);
    }

    public function resolve(SystemError $systemError)
    {
        if (! $systemError->resolved_at) {
            $systemError->forceFill([
                'resolved_at' => now(),
            ])->save();
        }

        return response()->json([
            'message' => 'System error marked as resolved.',
        ]);
    }

    private function applyFilters(Builder $query, Request $request, array $options = []): Builder
    {
        $launchStartAt = $this->resolveLaunchStartAt();
        $resolutionStatus = $request->input('resolution_status', 'open');

        if (! ($options['ignore_resolution_status'] ?? false)) {
            if ($resolutionStatus === 'resolved') {
                $query->whereNotNull('resolved_at');
            } elseif ($resolutionStatus !== 'all') {
                $query->whereNull('resolved_at');
            }
        }

        if ($tenantId = $request->input('tenant_id')) {
            $query->where('tenant_id', $tenantId);
        }

        if ($level = $request->input('level')) {
            $query->where('level', $level);
        }

        if ($search = trim((string) $request->input('search', ''))) {
            $query->where(function (Builder $builder) use ($search) {
                $builder
                    ->where('message', 'like', "%{$search}%")
                    ->orWhere('service', 'like', "%{$search}%")
                    ->orWhere('endpoint', 'like', "%{$search}%");
            });
        }

        if ($launchStartAt) {
            $query->where('last_seen_at', '>=', $launchStartAt);
        }

        if ($options['force_last_24_hours'] ?? false) {
            $query->where('last_seen_at', '>=', now()->subDay());
        } else {
            if ($dateFrom = $request->input('date_from')) {
                $query->where('last_seen_at', '>=', Carbon::parse($dateFrom)->startOfDay());
            }

            if ($dateTo = $request->input('date_to')) {
                $query->where('last_seen_at', '<=', Carbon::parse($dateTo)->endOfDay());
            }
        }

        return $query;
    }

    private function resolveLaunchStartAt(): ?Carbon
    {
        $value = config('app.system_error_log_start_at');
        if (!is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable $e) {
            return null;
        }
    }
}
