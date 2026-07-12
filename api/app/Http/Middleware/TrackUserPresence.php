<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use Closure;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class TrackUserPresence
{
    // Consider the user continuously "online" if there was activity within this window.
    // This matches the frontend's 15 minutes online threshold.
    private const CONTINUOUS_WINDOW_SECONDS = 15 * 60;

    protected function tenantConnectionName(Request $request): string
    {
        if (app()->bound('tenant') && app('tenant')) {
            return app('tenant')->tenancy_type === 'dedicated'
                ? config('multitenancy.tenant_database_connection_name', 'tenant-dedicated')
                : config('database.default', 'mysql');
        }

        $tenantId = $request->user()?->tenant_id;
        if (!$tenantId) {
            return config('database.default', 'mysql');
        }

        $tenant = Tenant::query()->find($tenantId);

        return $tenant && $tenant->tenancy_type === 'dedicated'
            ? config('multitenancy.tenant_database_connection_name', 'tenant-dedicated')
            : config('database.default', 'mysql');
    }

    protected function tenantConnection(Request $request)
    {
        return DB::connection($this->tenantConnectionName($request));
    }

    protected function tenantSchema(Request $request)
    {
        return Schema::connection($this->tenantConnectionName($request));
    }

    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        $user = $request->user();
        if (!$user || !$user->tenant_id) {
            return $response;
        }
        try {
            if (!$this->tenantSchema($request)->hasTable('user_presence_daily')) {
                return $response;
            }
        } catch (\Throwable $e) {
            return $response;
        }

        $tenantId = (int) $user->tenant_id;
        $userId = (int) $user->id;

        $now = now();
        $date = $now->toDateString();

        // Low-impact tracking: we only add time when requests are reasonably close together.
        // If the gap is larger than the window, we treat it as a new session and don't add the whole gap.
        $attempts = 0;
        while ($attempts < 2) {
            $attempts++;
            try {
                $connection = $this->tenantConnection($request);

                $connection->transaction(function () use ($tenantId, $userId, $date, $now, $connection) {
                    $row = $connection->table('user_presence_daily')
                        ->where('tenant_id', $tenantId)
                        ->where('user_id', $userId)
                        ->where('date', $date)
                        ->lockForUpdate()
                        ->first();

                    if (!$row) {
                        $connection->table('user_presence_daily')->insert([
                            'tenant_id' => $tenantId,
                            'user_id' => $userId,
                            'date' => $date,
                            'total_seconds' => 0,
                            'last_tick_at' => $now,
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                        return;
                    }

                    $addSeconds = 0;
                    if (!empty($row->last_tick_at)) {
                        try {
                            $last = \Carbon\Carbon::parse($row->last_tick_at);
                            $delta = $last->diffInSeconds($now, false);
                            if ($delta > 0 && $delta <= self::CONTINUOUS_WINDOW_SECONDS) {
                                $addSeconds = $delta;
                            }
                        } catch (\Throwable $e) {
                            // Ignore malformed timestamps; just reset the tick below.
                        }
                    }

                    $update = [
                        'last_tick_at' => $now,
                        'updated_at' => $now,
                    ];
                    if ($addSeconds > 0) {
                        $update['total_seconds'] = DB::raw('total_seconds + ' . (int) $addSeconds);
                    }

                    $connection->table('user_presence_daily')
                        ->where('id', (int) $row->id)
                        ->update($update);
                }, 3);

                break;
            } catch (QueryException $e) {
                // If we raced on the unique key insert, retry once.
                $msg = strtolower($e->getMessage());
                $isDuplicate = str_contains($msg, 'duplicate') || str_contains($msg, 'unique');
                if ($attempts < 2 && $isDuplicate) {
                    continue;
                }
                // Never break the request flow because of presence tracking.
                break;
            } catch (\Throwable $e) {
                // Never break the request flow because of presence tracking.
                break;
            }
        }

        return $response;
    }
}
