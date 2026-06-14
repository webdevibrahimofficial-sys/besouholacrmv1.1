<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Get top users by lead actions count in the current tenant.
     */
    public function topUsers(Request $request)
    {
        // Date filters
        $dateFrom = $request->input('date_from');
        $dateTo = $request->input('date_to');
        $user = $request->user();
        $tenantId = $user?->tenant_id ?? (app()->bound('current_tenant_id') ? app('current_tenant_id') : null);

        $query = User::query()
            ->select(
                'users.id as user_id',
                'users.name',
                'users.email',
                DB::raw('COUNT(lead_actions.id) as total_actions')
            )
            ->where('users.tenant_id', $tenantId)
            ->leftJoin('lead_actions', function ($join) use ($dateFrom, $dateTo, $tenantId) {
                $join->on('lead_actions.user_id', '=', 'users.id');

                if ($tenantId) {
                    $join->where('lead_actions.tenant_id', '=', $tenantId);
                }

                if ($dateFrom) {
                    $join->whereDate('lead_actions.created_at', '>=', $dateFrom);
                }

                if ($dateTo) {
                    $join->whereDate('lead_actions.created_at', '<=', $dateTo);
                }
            });

        $topUsers = $query->groupBy('users.id', 'users.name', 'users.email')
            ->orderByDesc('total_actions')
            ->get();

        // Format the response
        $data = $topUsers->map(function ($row) {
            return [
                'user_id' => $row->user_id,
                'name' => $row->name ?: 'Unknown User',
                'email' => $row->email ?: '',
                'total_actions' => (int) $row->total_actions,
            ];
        });

        return response()->json($data);
    }
}
