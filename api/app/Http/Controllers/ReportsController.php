<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\Customer;
use App\Models\Visit;
use App\Models\Export;
use App\Models\InventoryRequest;
use App\Models\RealEstateRequest;
use App\Models\Revenue;
use App\Models\Tenant;
use App\Models\User;
use App\Models\CancelReason;
use App\Models\Item;
use App\Models\Project;
use App\Traits\UserHierarchyTrait;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Carbon\Carbon;

class ReportsController extends Controller
{
    use UserHierarchyTrait;

    private function parseActionDetails($details): array
    {
        if (is_array($details)) {
            return $details;
        }

        if (!is_string($details) || trim($details) === '') {
            return [];
        }

        $decoded = json_decode($details, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function normalizeReportLabel(?string $value, string $fallback = 'Unknown'): string
    {
        $clean = trim((string) $value);
        return $clean !== '' ? $clean : $fallback;
    }

    private function normalizeLooseText(?string $value): string
    {
        $text = mb_strtolower(trim((string) $value));
        $text = preg_replace('/\s+/u', ' ', $text) ?? $text;
        return trim($text);
    }

    private function normalizeMoneyValue($value): float
    {
        if (is_numeric($value)) {
            return (float) $value;
        }

        if (is_string($value)) {
            $normalized = preg_replace('/[^\d.\-]/', '', str_replace(',', '', $value));
            if ($normalized !== null && $normalized !== '' && is_numeric($normalized)) {
                return (float) $normalized;
            }
        }

        return 0.0;
    }

    private function extractCancellationRevenue(LeadAction $action, $lead = null): float
    {
        $details = $this->parseActionDetails($action->details);

        foreach ([
            $details['closingRevenue'] ?? null,
            $details['revenue'] ?? null,
            $details['amount'] ?? null,
            $lead?->estimated_value ?? null,
        ] as $candidate) {
            $amount = $this->normalizeMoneyValue($candidate);
            if ($amount > 0) {
                return $amount;
            }
        }

        return 0.0;
    }

    private function extractCancelReasonFromAction(LeadAction $action): string
    {
        $details = $this->parseActionDetails($action->details);

        $directKeys = [
            'cancelReason',
            'cancel_reason',
            'reason',
            'reason_text',
        ];

        foreach ($directKeys as $key) {
            $value = trim((string) ($details[$key] ?? ''));
            if ($value !== '') {
                return $value;
            }
        }

        $comments = $details['comments'] ?? [];
        if (is_array($comments)) {
            foreach ($comments as $comment) {
                if (!is_array($comment)) {
                    continue;
                }

                $kind = strtolower(trim((string) ($comment['kind'] ?? '')));
                $text = trim((string) ($comment['text'] ?? ''));
                if ($kind === 'cancel_reason' && $text !== '') {
                    return $text;
                }
            }
        }

        $description = trim((string) ($action->description ?? ''));
        if ($description !== '') {
            $parts = preg_split('/\s*-\s*/u', $description);
            if (is_array($parts) && count($parts) > 0) {
                $candidate = trim((string) ($parts[0] ?? ''));
                if ($candidate !== '') {
                    return $candidate;
                }
            }
            return $description;
        }

        return 'No Reason';
    }

    private function extractStageLabelFromAction(?LeadAction $action): string
    {
        if (!$action) {
            return '';
        }

        $details = $this->parseActionDetails($action->details);

        return trim((string) (
            $action->stageAtCreation?->name
            ?? $action->stageAtCreation?->name_ar
            ?? $details['stage']
            ?? $details['stage_name']
            ?? $details['stage_at_creation_name']
            ?? ''
        ));
    }

    private function extractCancelStageFromAction(LeadAction $action): string
    {
        $stage = '';
        $previousActions = LeadAction::query()
            ->with(['stageAtCreation:id,name,name_ar'])
            ->where('lead_id', $action->lead_id)
            ->where('id', '<', $action->id)
            ->orderByDesc('id')
            ->limit(10)
            ->get();

        foreach ($previousActions as $previousAction) {
            $candidate = $this->extractStageLabelFromAction($previousAction);
            if ($candidate === '') {
                continue;
            }

            $candidateLower = mb_strtolower($candidate);
            if (str_contains($candidateLower, 'cancel') || str_contains($candidateLower, 'إلغاء')) {
                continue;
            }

            $stage = $candidate;
            break;
        }

        if ($stage === '') {
            $stage = $this->extractStageLabelFromAction($action);
        }

        return $this->normalizeReportLabel($stage, 'Unknown Stage');
    }

    private function isCancelledLeadState($lead): bool
    {
        $stage = mb_strtolower(trim((string) ($lead?->stage ?? '')));
        $status = mb_strtolower(trim((string) ($lead?->status ?? '')));

        return str_contains($stage, 'cancel')
            || str_contains($stage, 'إلغاء')
            || in_array($status, ['canceled', 'cancelled', 'lost', 'خسارة'], true);
    }

    private function extractCancellationStageFromLead($lead): string
    {
        return $this->normalizeReportLabel($lead?->stage, 'Cancelled / Lost');
    }

    private function applyVisibleLeadScope($query, User $user, ?array $viewableUserIds = null)
    {
        if ($user->tenant_id) {
            $query->where('tenant_id', $user->tenant_id);
        }

        if ($viewableUserIds !== null) {
            $query->whereIn('assigned_to', $viewableUserIds);
        }

        return $query;
    }

    private function applyNonDuplicateLeadScope($query)
    {
        $dupPredicate = "(COALESCE(lower(status), '') = 'duplicate' OR COALESCE(lower(stage), '') = 'duplicate')";
        return $query->whereRaw("NOT ($dupPredicate)");
    }

    private function applyCancelledLeadScope($query)
    {
        return $query->where(function ($sub) {
            $sub->whereRaw("LOWER(COALESCE(stage, '')) LIKE '%cancel%'")
                ->orWhereRaw("COALESCE(stage, '') LIKE '%إلغاء%'")
                ->orWhereIn(DB::raw("LOWER(COALESCE(status, ''))"), ['canceled', 'cancelled', 'lost'])
                ->orWhereExists(function ($exists) {
                    $exists->select(DB::raw(1))
                        ->from('lead_actions')
                        ->whereColumn('lead_actions.lead_id', 'leads.id')
                        ->where('lead_actions.action_type', 'cancel');
                });
        });
    }

    private function getCancellationDashboardStats(User $user, Carbon $startOfMonth, Carbon $endOfMonth, Carbon $startOfLastMonth, Carbon $endOfLastMonth): array
    {
        $viewableUserIds = $this->getViewableUserIds($user);

        $buildQuery = function () use ($user, $viewableUserIds) {
            $query = Lead::query();
            $this->applyVisibleLeadScope($query, $user, $viewableUserIds);
            $this->applyNonDuplicateLeadScope($query);
            $this->applyCancelledLeadScope($query);
            // Count each cancelled lead once even if it matches both state and cancel-action conditions.
            $query->select('leads.id')->distinct();
            return $query;
        };

        $totalValue = (clone $buildQuery())->count('leads.id');
        $currentValue = (clone $buildQuery())->whereBetween('updated_at', [$startOfMonth, $endOfMonth])->count('leads.id');
        $lastMonthValue = (clone $buildQuery())->whereBetween('updated_at', [$startOfLastMonth, $endOfLastMonth])->count('leads.id');

        $trend = 0;
        if ($lastMonthValue > 0) {
            $trend = (($currentValue - $lastMonthValue) / $lastMonthValue) * 100;
        } elseif ($currentValue > 0) {
            $trend = 100;
        }

        return [
            'value' => $totalValue,
            'trend' => round($trend, 1),
            'trendUp' => $trend >= 0,
        ];
    }

    private function resolveLeadProjectOrItemLabel($lead, array $itemsById, array $projectsById, string $companyType): string
    {
        if ($companyType === 'general') {
            $meta = is_array($lead?->meta_data ?? null) ? $lead->meta_data : [];
            $itemId = (int) ($lead?->item_id ?? 0);
            $label = trim((string) (
                $lead?->item_name
                ?? ($meta['lead_item_name'] ?? null)
                ?? ($meta['item_name'] ?? null)
                ?? ($itemId > 0 ? ($itemsById[$itemId] ?? '') : '')
            ));

            return $this->normalizeReportLabel($label, 'Unknown Item');
        }

        $projectId = (int) ($lead?->project_id ?? 0);
        $label = trim((string) (
            $lead?->project
            ?? ($projectId > 0 ? ($projectsById[$projectId] ?? '') : '')
        ));

        return $this->normalizeReportLabel($label, 'Unknown Project');
    }

    private function collectManagerScopeUserIds(?string $managerId, ?int $tenantId): array
    {
        $managerId = trim((string) $managerId);
        if ($managerId === '' || !ctype_digit($managerId)) {
            return [];
        }

        $users = User::query()
            ->when($tenantId, fn ($query) => $query->where('tenant_id', $tenantId))
            ->get(['id', 'manager_id']);

        $childrenByManager = [];
        foreach ($users as $user) {
            $key = (string) ($user->manager_id ?? '');
            $childrenByManager[$key][] = (int) $user->id;
        }

        $stack = [(int) $managerId];
        $resolved = [];

        while (!empty($stack)) {
            $current = array_pop($stack);
            if (in_array($current, $resolved, true)) {
                continue;
            }

            $resolved[] = $current;
            foreach ($childrenByManager[(string) $current] ?? [] as $childId) {
                $stack[] = $childId;
            }
        }

        return $resolved;
    }

    public function dashboardStats(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $now = Carbon::now();
        $startOfMonth = $now->copy()->startOfMonth();
        $endOfMonth = $now->copy()->endOfMonth();
        $startOfLastMonth = $now->copy()->subMonth()->startOfMonth();
        $endOfLastMonth = $now->copy()->subMonth()->endOfMonth();
        $tenant = $user->tenant_id ? Tenant::find($user->tenant_id) : null;
        $companyType = strtolower((string) ($tenant?->company_type ?? ''));

        // Get viewable user IDs for filtering (Hierarchy)
        $viewableUserIds = $this->getViewableUserIds($user);

        // Helper to get count and trend with hierarchy filtering
        $getStats = function ($model, $dateColumn = 'created_at', $conditions = [], $sumColumn = null, $assignedColumnOverride = null) use ($startOfMonth, $endOfMonth, $startOfLastMonth, $endOfLastMonth, $user, $viewableUserIds) {
            $query = $model::query();
            
            // Apply tenant scope
            if ($user->tenant_id) {
                $query->where('tenant_id', $user->tenant_id);
            }

            // Apply visibility filters (Hierarchy)
            if ($viewableUserIds !== null) {
                 $assignedColumn = $assignedColumnOverride;
                 if (!$assignedColumn) {
                     $assignedColumn = 'assigned_to';
                     if ($model === Visit::class) {
                         $assignedColumn = 'sales_person_id';
                     } elseif ($model === LeadAction::class || $model === Revenue::class || $model === Export::class) {
                         $assignedColumn = 'user_id';
                     } elseif ($model === Customer::class) {
                         $assignedColumn = 'assigned_to';
                     }
                 }
                 $query->whereIn($assignedColumn, $viewableUserIds);
            }
            
            foreach ($conditions as $column => $value) {
                if (is_array($value)) {
                    $query->whereIn($column, $value);
                } else {
                    $query->where($column, $value);
                }
            }

            if ($model === Lead::class) {
                $dupPredicate = "(COALESCE(lower(status), '') = 'duplicate' OR COALESCE(lower(stage), '') = 'duplicate')";
                $query->whereRaw("NOT ($dupPredicate)");
            }

            // Calculate Values
            if ($sumColumn) {
                $currentValue = (clone $query)->whereBetween($dateColumn, [$startOfMonth, $endOfMonth])->sum($sumColumn);
                $lastMonthValue = (clone $query)->whereBetween($dateColumn, [$startOfLastMonth, $endOfLastMonth])->sum($sumColumn);
                $totalValue = $query->sum($sumColumn);
            } else {
                $currentValue = (clone $query)->whereBetween($dateColumn, [$startOfMonth, $endOfMonth])->count();
                $lastMonthValue = (clone $query)->whereBetween($dateColumn, [$startOfLastMonth, $endOfLastMonth])->count();
                $totalValue = $query->count();
            }

            // Calculate Trend
            $trend = 0;
            if ($lastMonthValue > 0) {
                $trend = (($currentValue - $lastMonthValue) / $lastMonthValue) * 100;
            } elseif ($currentValue > 0) {
                $trend = 100;
            }

            return [
                'value' => $totalValue,
                'trend' => round($trend, 1),
                'trendUp' => $trend >= 0
            ];
        };

        // 1. Leads Pipeline (Total Leads)
        $leadsStats = $getStats(Lead::class);

        // 2. Sales Activities (Total Activities)
        $activitiesStats = $getStats(LeadAction::class);

        // 3. Meetings Report
        // Keep this aligned with LeadController::meetingsReport():
        // count meeting actions based on the lead assignee visibility, not the action creator.
        $getMeetingsStats = function () use ($user, $startOfMonth, $endOfMonth, $startOfLastMonth, $endOfLastMonth) {
            $roleLower = strtolower($user->role ?? '');
            $isAdminOrDirector = $user->is_super_admin ||
                in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'director', 'operation manager']);

            $buildQuery = function () use ($user, $isAdminOrDirector) {
                $query = DB::table('leads')
                    ->join('lead_actions', 'lead_actions.lead_id', '=', 'leads.id')
                    ->where('lead_actions.action_type', 'meeting')
                    ->whereNull('leads.deleted_at');

                if ($user->tenant_id) {
                    $query->where('leads.tenant_id', $user->tenant_id);
                }

                if (!$isAdminOrDirector) {
                    $viewableUserIds = $this->getViewableUserIds($user);
                    if ($viewableUserIds !== null) {
                        $query->whereIn('leads.assigned_to', $viewableUserIds);
                    } else {
                        $query->where('leads.assigned_to', $user->id);
                    }
                }

                return $query;
            };

            $countForRange = function ($from, $to) use ($buildQuery) {
                return (clone $buildQuery())
                    ->whereBetween(
                        DB::raw("DATE(JSON_UNQUOTE(JSON_EXTRACT(lead_actions.details, '$.date')))"),
                        [$from->toDateString(), $to->toDateString()]
                    )
                    ->count('lead_actions.id');
            };

            $totalValue = (clone $buildQuery())->count('lead_actions.id');
            $currentValue = $countForRange($startOfMonth, $endOfMonth);
            $lastMonthValue = $countForRange($startOfLastMonth, $endOfLastMonth);

            $trend = 0;
            if ($lastMonthValue > 0) {
                $trend = (($currentValue - $lastMonthValue) / $lastMonthValue) * 100;
            } elseif ($currentValue > 0) {
                $trend = 100;
            }

            return [
                'value' => $totalValue,
                'trend' => round($trend, 1),
                'trendUp' => $trend >= 0,
            ];
        };

        $meetingsStats = $getMeetingsStats();

        // 4. Reservations Report
        $getReservationStats = function () use ($user, $companyType, $startOfMonth, $endOfMonth, $startOfLastMonth, $endOfLastMonth) {
            $buildQuery = function (string $modelClass) use ($user) {
                $query = $modelClass::query();

                if ($user->tenant_id) {
                    $query->where('tenant_id', $user->tenant_id);
                }

                return $query;
            };

            $countForRange = function ($from, $to) use ($buildQuery, $companyType) {
                $total = 0;

                if ($companyType === 'real estate' || $companyType === '') {
                    $total += (clone $buildQuery(RealEstateRequest::class))
                        ->whereBetween('created_at', [$from, $to])
                        ->count();
                }

                if ($companyType === 'general' || $companyType === '') {
                    $total += (clone $buildQuery(InventoryRequest::class))
                        ->whereBetween('created_at', [$from, $to])
                        ->count();
                }

                return $total;
            };

            $totalValue = 0;
            if ($companyType === 'real estate' || $companyType === '') {
                $totalValue += $buildQuery(RealEstateRequest::class)->count();
            }
            if ($companyType === 'general' || $companyType === '') {
                $totalValue += $buildQuery(InventoryRequest::class)->count();
            }

            $currentValue = $countForRange($startOfMonth, $endOfMonth);
            $lastMonthValue = $countForRange($startOfLastMonth, $endOfLastMonth);

            $trend = 0;
            if ($lastMonthValue > 0) {
                $trend = (($currentValue - $lastMonthValue) / $lastMonthValue) * 100;
            } elseif ($currentValue > 0) {
                $trend = 100;
            }

            return [
                'value' => $totalValue,
                'trend' => round($trend, 1),
                'trendUp' => $trend >= 0,
            ];
        };

        $reservationsStats = $getReservationStats();

        // 5. Closed Deals
        $dealsStats = $getStats(LeadAction::class, 'created_at', ['action_type' => 'closing_deals']);

        // 6. Rent Report
        $rentStats = $getStats(LeadAction::class, 'created_at', ['action_type' => 'rent']);

        // 7. Proposals Report — count actions where action_type = 'proposal'
        $proposalsStats = $getStats(LeadAction::class, 'created_at', ['action_type' => 'proposal']);

        // 8. Check In Report
        $checkInStats = $getStats(Visit::class, 'check_in_at');

        // 9. Customers Report (real customers table, tenant + hierarchy scoped)
        $customersStats = $getStats(Customer::class, 'created_at', [], null, 'assigned_to');

        // 10. Targets & Revenue (Sum amount)
        $revenueStats = $getStats(Revenue::class, 'created_at', [], 'amount');

        // 11. Imports Report
        $importsStats = $getStats(Export::class, 'created_at', ['action' => 'import']);

        // 12. Export Report
        $exportsStats = $getStats(Export::class, 'created_at', ['action' => 'export']);

        // 13. Cancellation Report
        $cancellationStats = $this->getCancellationDashboardStats($user, $startOfMonth, $endOfMonth, $startOfLastMonth, $endOfLastMonth);


        return response()->json([
            'leads_pipeline' => $leadsStats,
            'sales_activities' => $activitiesStats,
            'meetings_report' => $meetingsStats,
            'reservations_report' => $reservationsStats,
            'closed_deals' => $dealsStats,
            'rent_report' => $rentStats,
            'proposals_report' => $proposalsStats,
            'check_in_report' => $checkInStats,
            'customers_report' => $customersStats,
            'targets_revenue' => $revenueStats,
            'imports_report' => $importsStats,
            'export_report' => $exportsStats,
            'cancellation_report' => $cancellationStats,
        ]);
    }

    public function teamStats(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        Log::info('teamStats User: ' . $user->id . ' - ' . $user->name);
        Log::info('teamStats Roles: ' . $user->getRoleNames()->implode(', '));

        // Determine scope: Tenant Admin/Director sees all, others see subordinates
        $query = \App\Models\User::with(['roles']);
        
        $hasFullAccess = $user->hasAnyRole(['Tenant Admin', 'Director', 'General Manager', 'Owner', 'Super Admin']);
        Log::info('teamStats hasFullAccess: ' . ($hasFullAccess ? 'Yes' : 'No'));

        if (!$hasFullAccess) {
            $query->where('manager_id', $user->id);
        }

        $subordinates = $query->get();
            
        if ($subordinates->isEmpty()) {
            return response()->json([]);
        }

        $subordinateIds = $subordinates->pluck('id');

        $now = Carbon::now();
        $startOfMonth = $now->copy()->startOfMonth();
        $endOfMonth = $now->copy()->endOfMonth();

        // Leads count per user (assigned_to) - This Month
        $leads = Lead::whereIn('assigned_to', $subordinateIds)
                     ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
                     ->select('assigned_to', DB::raw('count(*) as count'))
                     ->groupBy('assigned_to')
                     ->pluck('count', 'assigned_to');

        // Revenue per user (user_id) - This Month
        $revenue = Revenue::whereIn('user_id', $subordinateIds)
                          ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
                          ->select('user_id', DB::raw('sum(amount) as total'))
                          ->groupBy('user_id')
                          ->pluck('total', 'user_id');

        // Activities per user (user_id) - This Month
        $activities = LeadAction::whereIn('user_id', $subordinateIds)
                                ->whereBetween('created_at', [$startOfMonth, $endOfMonth])
                                ->select('user_id', DB::raw('count(*) as count'))
                                ->groupBy('user_id')
                                ->pluck('count', 'user_id');
                                
        $data = $subordinates->map(function($sub) use ($leads, $revenue, $activities) {
            $monthlyRevenue = $revenue[$sub->id] ?? 0;
            $monthlyTarget = (float)($sub->monthly_target ?? 0);
            
            return [
                'id' => $sub->id,
                'name' => $sub->name,
                'role' => $sub->roles->first()?->name ?? $sub->role,
                'job_title' => $sub->job_title,
                'avatar_url' => $sub->avatar_url,
                'monthly_target' => $monthlyTarget,
                'yearly_target' => (float)($sub->yearly_target ?? 0),
                
                'leads_count' => $leads[$sub->id] ?? 0,
                'revenue' => $monthlyRevenue,
                'activities_count' => $activities[$sub->id] ?? 0,
                'achievement_percent' => ($monthlyTarget > 0) 
                     ? round(($monthlyRevenue / $monthlyTarget) * 100, 1) 
                     : 0
            ];
        });

        return response()->json($data);
    }

    public function cancellationReport(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $viewableUserIds = $this->getViewableUserIds($user);
        $tenant = $user->tenant_id ? Tenant::find($user->tenant_id) : null;
        $companyType = strtolower((string) ($tenant?->company_type ?? ''));
        $managerScopeIds = $this->collectManagerScopeUserIds($request->input('manager_id'), $user->tenant_id);
        $assignedTo = trim((string) $request->input('assigned_to', ''));
        $project = trim((string) $request->input('project', ''));
        $source = trim((string) $request->input('source', ''));
        $cancelReasonFilter = trim((string) $request->input('cancel_reason', ''));
        $cancelReasonCandidates = [];
        if ($cancelReasonFilter !== '') {
            $cancelReasonCandidates[$this->normalizeLooseText($cancelReasonFilter)] = true;

            $matchedReasons = CancelReason::query()
                ->when($user->tenant_id, fn ($query) => $query->where('tenant_id', $user->tenant_id))
                ->where(function ($query) use ($cancelReasonFilter) {
                    $query->where('title', $cancelReasonFilter)
                        ->orWhere('title_ar', $cancelReasonFilter);
                })
                ->get(['title', 'title_ar']);

            foreach ($matchedReasons as $reasonRow) {
                foreach ([$reasonRow->title, $reasonRow->title_ar] as $candidate) {
                    $normalized = $this->normalizeLooseText($candidate);
                    if ($normalized !== '') {
                        $cancelReasonCandidates[$normalized] = true;
                    }
                }
            }
        }
        $createdFrom = $request->input('created_from');
        $createdTo = $request->input('created_to');
        $cancelledFrom = $request->input('cancelled_from');
        $cancelledTo = $request->input('cancelled_to');
        $hasLeadItemNameColumn = Schema::hasColumn('leads', 'item_name');
        $itemLabelColumns = array_values(array_filter([
            'id',
            Schema::hasColumn('items', 'name') ? 'name' : null,
            Schema::hasColumn('items', 'product') ? 'product' : null,
            Schema::hasColumn('items', 'title') ? 'title' : null,
        ]));

        $applyLeadFilters = function ($query) use (
            $user,
            $viewableUserIds,
            $managerScopeIds,
            $assignedTo,
            $project,
            $source,
            $createdFrom,
            $createdTo
        ) {
            if ($user->tenant_id) {
                $query->where('tenant_id', $user->tenant_id);
            }

            if ($viewableUserIds !== null) {
                $query->whereIn('assigned_to', $viewableUserIds);
            }

            if (!empty($managerScopeIds)) {
                $query->whereIn('assigned_to', $managerScopeIds);
            }

            if ($assignedTo !== '' && ctype_digit($assignedTo)) {
                $query->where('assigned_to', (int) $assignedTo);
            }

            if ($project !== '') {
                $query->where(function ($sub) use ($project, $hasLeadItemNameColumn) {
                    $sub->where('project', $project)
                        ->orWhere('project_id', $project);

                    if ($hasLeadItemNameColumn) {
                        $sub->orWhere('item_name', $project);
                    }

                    $sub->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(COALESCE(meta_data, '{}'), '$.lead_item_name')) = ?", [$project])
                        ->orWhereRaw("JSON_UNQUOTE(JSON_EXTRACT(COALESCE(meta_data, '{}'), '$.item_name')) = ?", [$project]);
                });
            }

            if ($source !== '') {
                $query->where('source', $source);
            }

            if ($createdFrom) {
                $query->whereDate('created_at', '>=', $createdFrom);
            }

            if ($createdTo) {
                $query->whereDate('created_at', '<=', $createdTo);
            }

            $dupPredicate = "(COALESCE(lower(status), '') = 'duplicate' OR COALESCE(lower(stage), '') = 'duplicate')";
            $query->whereRaw("NOT ($dupPredicate)");
        };

        $usersInScopeQuery = User::query()
            ->when($user->tenant_id, fn ($query) => $query->where('tenant_id', $user->tenant_id));

        if ($viewableUserIds !== null) {
            $usersInScopeQuery->whereIn('id', $viewableUserIds);
        }

        if (!empty($managerScopeIds)) {
            $usersInScopeQuery->whereIn('id', $managerScopeIds);
        }

        if ($assignedTo !== '' && ctype_digit($assignedTo)) {
            $usersInScopeQuery->where('id', (int) $assignedTo);
        }

        $usersInScope = $usersInScopeQuery
            ->get(['id', 'name'])
            ->sortBy(fn ($userRow) => mb_strtolower(trim((string) ($userRow->name ?? ''))))
            ->values();

        $scopeUsersById = [];
        foreach ($usersInScope as $userRow) {
            $scopeUsersById[(int) $userRow->id] = $this->normalizeReportLabel($userRow->name, 'Unknown User');
        }

        $leadSelectColumns = ['id', 'assigned_to', 'source', 'project', 'project_id', 'item_id', 'meta_data', 'stage', 'status', 'estimated_value', 'created_at', 'updated_at'];
        if ($hasLeadItemNameColumn) {
            $leadSelectColumns[] = 'item_name';
        }

        $leadRows = Lead::query()
            ->with(['assignedAgent:id,name'])
            ->where($applyLeadFilters)
            ->get($leadSelectColumns);

        $itemIds = $leadRows
            ->pluck('item_id')
            ->filter(fn ($value) => !empty($value))
            ->map(fn ($value) => (int) $value)
            ->unique()
            ->values();

        $itemsById = empty($itemIds->all())
            ? []
            : Item::query()
                ->when($user->tenant_id, fn ($query) => $query->where('tenant_id', $user->tenant_id))
                ->whereIn('id', $itemIds)
                ->get($itemLabelColumns)
                ->mapWithKeys(function ($item) {
                    $label = trim((string) ($item->name ?? $item->product ?? $item->title ?? ''));
                    return [(int) $item->id => $label];
                })
                ->all();

        $projectIds = $leadRows
            ->pluck('project_id')
            ->filter(fn ($value) => !empty($value))
            ->map(fn ($value) => (int) $value)
            ->unique()
            ->values();

        $projectsById = empty($projectIds->all())
            ? []
            : Project::query()
                ->when($user->tenant_id, fn ($query) => $query->where('tenant_id', $user->tenant_id))
                ->whereIn('id', $projectIds)
                ->get(['id', 'name', 'name_ar'])
                ->mapWithKeys(function ($project) {
                    $label = trim((string) ($project->name ?? $project->name_ar ?? ''));
                    return [(int) $project->id => $label];
                })
                ->all();

        $totalLeads = $leadRows->count();
        $leadCountsBySalesId = [];
        $sourceOptions = [];
        $projectOptions = [];

        foreach ($leadRows as $lead) {
            $salesId = (int) ($lead->assigned_to ?? 0);
            if ($salesId > 0) {
                $leadCountsBySalesId[$salesId] = ($leadCountsBySalesId[$salesId] ?? 0) + 1;
            }

            $sourceLabel = trim((string) ($lead->source ?? ''));
            if ($sourceLabel !== '') {
                $sourceOptions[$sourceLabel] = true;
            }

            $projectLabel = $this->resolveLeadProjectOrItemLabel($lead, $itemsById, $projectsById, $companyType);
            if ($projectLabel !== '') {
                $projectOptions[$projectLabel] = true;
            }
        }

        $cancelLeadRelationColumns = ['id', 'assigned_to', 'source', 'project', 'project_id', 'item_id', 'meta_data', 'stage', 'status', 'estimated_value', 'updated_at'];
        if ($hasLeadItemNameColumn) {
            $cancelLeadRelationColumns[] = 'item_name';
        }

        $cancelActions = LeadAction::query()
            ->with([
                'lead:' . implode(',', $cancelLeadRelationColumns),
                'lead.assignedAgent:id,name',
                'stageAtCreation:id,name,name_ar',
            ])
            ->where('action_type', 'cancel')
            ->whereHas('lead', $applyLeadFilters)
            ->when($cancelledFrom, fn ($query) => $query->whereDate('created_at', '>=', $cancelledFrom))
            ->when($cancelledTo, fn ($query) => $query->whereDate('created_at', '<=', $cancelledTo))
            ->orderByDesc('id')
            ->get();

        $entries = [];
        $seenLeadIds = [];

        foreach ($cancelActions as $action) {
            $leadId = (int) ($action->lead_id ?? 0);
            if ($leadId <= 0 || isset($seenLeadIds[$leadId])) {
                continue;
            }

            $reason = $this->extractCancelReasonFromAction($action);
            if (!empty($cancelReasonCandidates) && !isset($cancelReasonCandidates[$this->normalizeLooseText($reason)])) {
                continue;
            }

            $seenLeadIds[$leadId] = true;
            $lead = $action->lead;
            $salesId = (int) ($lead?->assigned_to ?? 0);
            $salesName = $salesId > 0
                ? ($scopeUsersById[$salesId] ?? $this->normalizeReportLabel($lead?->assignedAgent?->name, 'Unknown User'))
                : $this->normalizeReportLabel($lead?->assignedAgent?->name, 'Unassigned');
            $stageName = $this->extractCancelStageFromAction($action);
            $sourceName = $this->normalizeReportLabel($lead?->source, 'Unknown Source');
            $projectName = $this->resolveLeadProjectOrItemLabel($lead, $itemsById, $projectsById, $companyType);
            $entryRevenue = $this->extractCancellationRevenue($action, $lead);

            $entries[] = [
                'lead_id' => $leadId,
                'salespersonId' => $salesId > 0 ? $salesId : null,
                'salesperson' => $salesName,
                'reason' => $reason,
                'stage' => $stageName,
                'source' => $sourceName,
                'project' => $projectName,
                'lostRevenue' => $entryRevenue,
                'cancelled_at' => optional($action->created_at)->toDateTimeString(),
            ];
        }

        foreach ($leadRows as $lead) {
            $leadId = (int) ($lead->id ?? 0);
            if ($leadId <= 0 || isset($seenLeadIds[$leadId]) || !$this->isCancelledLeadState($lead)) {
                continue;
            }

            $seenLeadIds[$leadId] = true;
            $salesId = (int) ($lead->assigned_to ?? 0);
            $salesName = $salesId > 0
                ? ($scopeUsersById[$salesId] ?? $this->normalizeReportLabel($lead?->assignedAgent?->name, 'Unknown User'))
                : $this->normalizeReportLabel($lead?->assignedAgent?->name, 'Unassigned');

            $entries[] = [
                'lead_id' => $leadId,
                'salespersonId' => $salesId > 0 ? $salesId : null,
                'salesperson' => $salesName,
                'reason' => $this->normalizeReportLabel($lead?->status, 'No Reason'),
                'stage' => $this->extractCancellationStageFromLead($lead),
                'source' => $this->normalizeReportLabel($lead?->source, 'Unknown Source'),
                'project' => $this->resolveLeadProjectOrItemLabel($lead, $itemsById, $projectsById, $companyType),
                'lostRevenue' => $this->normalizeMoneyValue($lead?->estimated_value),
                'cancelled_at' => optional($lead->updated_at)->toDateTimeString(),
            ];
        }

        $totalCancelled = count($entries);
        $reasonCounts = [];
        $stageCounts = [];
        $salesCancelCounts = [];
        $sourceCounts = [];
        $projectCounts = [];
        $lostRevenue = 0.0;
        $rowsBySales = [];

        foreach ($usersInScope as $userRow) {
            $salesId = (int) $userRow->id;
            $salesName = $scopeUsersById[$salesId] ?? $this->normalizeReportLabel($userRow->name, 'Unknown User');
            $rowsBySales[$salesId] = [
                'salespersonId' => $salesId,
                'salesperson' => $salesName,
                'totalLeads' => $leadCountsBySalesId[$salesId] ?? 0,
                'totalCanceled' => 0,
                'reasonCounts' => [],
            ];
        }

        foreach ($entries as $entry) {
            $reasonCounts[$entry['reason']] = ($reasonCounts[$entry['reason']] ?? 0) + 1;
            $stageCounts[$entry['stage']] = ($stageCounts[$entry['stage']] ?? 0) + 1;
            $salesCancelCounts[$entry['salesperson']] = ($salesCancelCounts[$entry['salesperson']] ?? 0) + 1;
            $sourceCounts[$entry['source']] = ($sourceCounts[$entry['source']] ?? 0) + 1;
            $projectCounts[$entry['project']] = ($projectCounts[$entry['project']] ?? 0) + 1;
            $lostRevenue += (float) ($entry['lostRevenue'] ?? 0);

            $rowKey = $entry['salespersonId'] ?: ('name:' . $entry['salesperson']);

            if (!isset($rowsBySales[$rowKey])) {
                $rowsBySales[$rowKey] = [
                    'salespersonId' => $entry['salespersonId'],
                    'salesperson' => $entry['salesperson'],
                    'totalLeads' => 0,
                    'totalCanceled' => 0,
                    'reasonCounts' => [],
                ];
            }

            $rowsBySales[$rowKey]['totalCanceled'] += 1;
            $rowsBySales[$rowKey]['reasonCounts'][$entry['reason']] =
                ($rowsBySales[$rowKey]['reasonCounts'][$entry['reason']] ?? 0) + 1;
        }

        arsort($reasonCounts);
        arsort($stageCounts);
        arsort($salesCancelCounts);
        arsort($sourceCounts);
        arsort($projectCounts);

        $topReasonColumns = array_slice(array_keys($reasonCounts), 0, 3);
        $tableRows = array_values(array_map(function ($row) use ($topReasonColumns) {
            foreach ($topReasonColumns as $reasonName) {
                $row['reasonCounts'][$reasonName] = $row['reasonCounts'][$reasonName] ?? 0;
            }

            ksort($row['reasonCounts']);
            return $row;
        }, $rowsBySales));

        usort($tableRows, function ($a, $b) {
            if (($b['totalCanceled'] ?? 0) === ($a['totalCanceled'] ?? 0)) {
                return ($b['totalLeads'] ?? 0) <=> ($a['totalLeads'] ?? 0);
            }
            return ($b['totalCanceled'] ?? 0) <=> ($a['totalCanceled'] ?? 0);
        });

        $toRankedList = function (array $counts, int $limit = 5): array {
            $result = [];
            foreach (array_slice($counts, 0, $limit, true) as $label => $count) {
                $result[] = [
                    'label' => $label,
                    'count' => (int) $count,
                ];
            }
            return $result;
        };

        $toChartSegments = function (array $counts, int $limit = 6): array {
            $palette = ['#ef4444', '#f97316', '#f59e0b', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
            $segments = [];
            $index = 0;
            $visibleCounts = array_slice($counts, 0, $limit, true);
            foreach ($visibleCounts as $label => $count) {
                $segments[] = [
                    'label' => $label,
                    'value' => (int) $count,
                    'color' => $palette[$index % count($palette)],
                ];
                $index++;
            }

            $otherCount = array_sum($counts) - array_sum($visibleCounts);
            if ($otherCount > 0) {
                $segments[] = [
                    'label' => 'Other',
                    'value' => (int) $otherCount,
                    'color' => '#94a3b8',
                ];
            }

            return $segments;
        };

        return response()->json([
            'summary' => [
                'totalLeads' => $totalLeads,
                'totalCancelled' => $totalCancelled,
                'lossRate' => $totalLeads > 0 ? round(($totalCancelled / $totalLeads) * 100, 1) : 0,
                'lostRevenue' => round($lostRevenue, 2),
            ],
            'charts' => [
                'sources' => $toChartSegments($sourceCounts),
                'projects' => $toChartSegments($projectCounts),
            ],
            'topLists' => [
                'stages' => $toRankedList($stageCounts),
                'sales' => $toRankedList($salesCancelCounts),
                'reasons' => $toRankedList($reasonCounts),
            ],
            'table' => [
                'reasonColumns' => $topReasonColumns,
                'rows' => $tableRows,
            ],
            'options' => [
                'sources' => array_values(array_keys($sourceOptions)),
                'projects' => array_values(array_keys($projectOptions)),
                'reasons' => array_values(array_keys($reasonCounts)),
                'companyType' => $companyType,
            ],
        ]);
    }
}
