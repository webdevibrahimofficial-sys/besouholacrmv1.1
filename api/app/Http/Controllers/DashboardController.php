<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\TelesalesService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    protected function excludeTelesalesUsers($query): void
    {
        $query->where(function ($roleQuery) {
            $roleQuery->whereNull('users.job_title')
                ->orWhereRaw("LOWER(users.job_title) NOT LIKE '%telesales%'");
        });

        $query->whereNotExists(function ($subQuery) {
            $subQuery->select(DB::raw(1))
                ->from('model_has_roles')
                ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
                ->whereColumn('model_has_roles.model_id', 'users.id')
                ->where('model_has_roles.model_type', User::class)
                ->whereRaw("LOWER(roles.name) LIKE '%telesales%'");
        });
    }

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

                $join->whereExists(function ($leadQuery) {
                    $leadQuery->select(DB::raw(1))
                        ->from('leads')
                        ->whereColumn('leads.id', 'lead_actions.lead_id')
                        ->where(function ($workflowQuery) {
                            $workflowQuery->where('leads.workflow_key', TelesalesService::WORKFLOW_SALES)
                                ->orWhereNull('leads.workflow_key')
                                ->orWhere('leads.workflow_key', '');
                        });
                });

                if ($dateFrom) {
                    $join->whereDate('lead_actions.created_at', '>=', $dateFrom);
                }

                if ($dateTo) {
                    $join->whereDate('lead_actions.created_at', '<=', $dateTo);
                }
            });

        $this->excludeTelesalesUsers($query);

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
