<?php

namespace App\Http\Controllers;

use App\Models\Campaign;
use App\Models\Item;
use App\Models\Project;
use App\Models\Tenant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use App\Http\Resources\CampaignResource;
use App\Support\AppliesAgencyScope;
use Illuminate\Validation\ValidationException;

class CampaignController extends Controller
{
    use AppliesAgencyScope;

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $campaigns = Campaign::query()->with(['project:id,name', 'item:id,name']);
        $this->applyAgencyScope($campaigns, $request->user());
        $campaigns = $campaigns->latest()->get();
        return CampaignResource::collection($campaigns);
    }

    public function dashboardStats(Request $request)
    {
        // Get campaigns
        $query = Campaign::query();
        $this->applyAgencyScope($query, $request->user());
        
        // Date filters
        if ($request->has('date_from')) {
            $query->whereDate('start_date', '>=', $request->date_from);
        }

        // Calculate Tenant-wide Average CPC (for Outlier Detection)
        // We use a separate query to get the global average across all campaigns (or just the filtered ones?)
        // The requirement says "Average CPC in all client campaigns".
        // We'll use all campaigns for a stable baseline.
        $tenantStatsQuery = Campaign::query();
        $this->applyAgencyScope($tenantStatsQuery, $request->user());
        $tenantStats = $tenantStatsQuery->selectRaw('SUM(spend) as total_spend, SUM(clicks) as total_clicks')
            ->first();
        
        $avgCpc = ($tenantStats && $tenantStats->total_clicks > 0) 
            ? $tenantStats->total_spend / $tenantStats->total_clicks 
            : 0;
        
        // Get all campaigns for the dashboard (removed limit to ensure accurate "Total Active" counts)
        $campaigns = $query->latest()->limit(100)->get();
        
        $data = $campaigns->map(function($c) use ($avgCpc) {
            // Calculate rates
            // Avoid division by zero
            $openRate = $c->impressions > 0 ? ($c->clicks / $c->impressions) * 100 : 0; 
            $clickRate = $c->impressions > 0 ? ($c->clicks / $c->impressions) * 100 : 0;
            $conversionRate = $c->clicks > 0 ? ($c->leads / $c->clicks) * 100 : 0;
            
            // Determine "At Risk" Status
            $dbStatus = strtoupper($c->status ?? '');
            $computedStatus = $c->status; // Default to DB status
            $riskReason = null;

            // Only analyze active campaigns
            if (in_array($dbStatus, ['ACTIVE', 'RUNNING', 'ON TRACK', 'ON_TRACK'])) {
                $isAtRisk = false;
                $reasons = [];

                // 1. Spending without Results (Spend > 0, Leads = 0, Active > 24h)
                $startTime = $c->start_date ?? $c->created_at;
                $hoursRunning = $startTime ? now()->diffInHours($startTime) : 0;
                
                if ($c->spend > 0 && $c->leads == 0 && $hoursRunning > 24) {
                    $isAtRisk = true;
                    $reasons[] = 'Spending without leads (>24h)';
                }

                // 2. CPC Outlier (CPC > 1.5 * Avg CPC)
                $myCpc = $c->clicks > 0 ? $c->spend / $c->clicks : 0;
                if ($avgCpc > 0 && $myCpc > ($avgCpc * 1.5)) {
                    $isAtRisk = true;
                    $reasons[] = 'High CPC (>1.5x Avg)';
                }

                // 3. Time Decay (Low Spend near end)
                // If campaign is near end (< 20% time left) and spend is low (< 20% budget)
                if ($c->end_date && ($c->lifetime_budget > 0 || $c->total_budget > 0)) {
                    $totalBudget = $c->lifetime_budget > 0 ? $c->lifetime_budget : $c->total_budget;
                    $totalDuration = $c->start_date ? $c->start_date->diffInSeconds($c->end_date) : 0;
                    $elapsed = $c->start_date ? $c->start_date->diffInSeconds(now()) : 0;

                    if ($totalDuration > 0 && $totalBudget > 0) {
                        $timeProgress = $elapsed / $totalDuration;
                        $spendProgress = $c->spend / $totalBudget;

                        // If > 80% time elapsed but < 20% budget spent
                        if ($timeProgress > 0.8 && $spendProgress < 0.2) {
                            $isAtRisk = true;
                            $reasons[] = 'Under-spending near end date';
                        }
                    }
                }

                if ($isAtRisk) {
                    $computedStatus = 'atRisk';
                    $riskReason = implode(', ', $reasons);
                } else {
                    $computedStatus = 'active';
                }
            } elseif (in_array($dbStatus, ['PAUSED', 'STOPPED', 'ARCHIVED', 'INACTIVE'])) {
                $computedStatus = 'paused';
            }

            return [
                'id' => $c->id,
                'name' => $c->name,
                'status' => $computedStatus, // Send calculated status
                'original_status' => $c->status,
                'owner' => $c->created_by ?? 'Unknown',
                'lastActivity' => $c->updated_at ? $c->updated_at->format('Y-m-d') : null,
                'openRate' => round($openRate, 1),
                'clickRate' => round($clickRate, 1),
                'conversionRate' => round($conversionRate, 1),
                'impressions' => $c->impressions,
                'clicks' => $c->clicks,
                'leads' => $c->leads,
                'riskReason' => $riskReason,
                'cpc' => $c->clicks > 0 ? round($c->spend / $c->clicks, 2) : 0,
                'spend' => $c->spend,
            ];
        });
        
        return response()->json($data);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        // Allow both snake_case and camelCase for validation
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'agency_id' => 'nullable|string|max:255',
            'source' => 'required|string',
            'startDate' => 'nullable|date',
            'start_date' => 'nullable|date',
            'endDate' => 'nullable|date',
            'end_date' => 'nullable|date',
            'totalBudget' => 'required|numeric|min:0',
            'total_budget' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'project_id' => 'nullable|integer',
            'item_id' => 'nullable|integer',
            'projectId' => 'nullable|integer',
            'itemId' => 'nullable|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $request->all();

        // Map camelCase to snake_case
        if ($request->has('budgetType')) $data['budget_type'] = $request->budgetType;
        if ($request->has('totalBudget')) $data['total_budget'] = $request->totalBudget;
        if ($request->has('startDate')) $data['start_date'] = $request->startDate;
        if ($request->has('endDate')) $data['end_date'] = $request->endDate;
        if ($request->has('landingPage')) $data['landing_page'] = $request->landingPage;
        if ($request->has('projectId')) $data['project_id'] = $request->projectId;
        if ($request->has('itemId')) $data['item_id'] = $request->itemId;

        $tenant = Tenant::query()->find($request->user()?->tenant_id);
        $isGeneral = strtolower(trim((string) ($tenant?->company_type ?? ''))) === 'general';
        if ($isGeneral) {
            if (empty($data['item_id'])) {
                return response()->json(['errors' => ['itemId' => ['Item is required.']]], 422);
            }
            $data['project_id'] = null;
        } else {
            if (empty($data['project_id'])) {
                return response()->json(['errors' => ['projectId' => ['Project is required.']]], 422);
            }
            $data['item_id'] = null;
        }
        
        // Auto-assign created_by if logged in
        if (!$request->has('created_by') && $request->user()) {
            $data['created_by'] = $request->user()->name;
        }

        $data['agency_id'] = $this->resolveAgencyIdForWrite($request, $request->user());

        $campaign = Campaign::create($data);

        return (new CampaignResource($campaign->load(['project:id,name', 'item:id,name'])))
            ->additional(['message' => 'Campaign created successfully'])
            ->response()
            ->setStatusCode(201);
    }

    /**
     * Display the specified resource.
     */
    public function show(Campaign $campaign)
    {
        $this->ensureAgencyOwnership(request()->user(), $campaign);
        return new CampaignResource($campaign);
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Campaign $campaign)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'agency_id' => 'nullable|string|max:255',
            'source' => 'sometimes|required|string',
            'billingModel' => 'nullable|in:cpl,cpa,cpd',
            'meta_data' => 'nullable|array',
            'startDate' => 'nullable|date',
            'start_date' => 'nullable|date',
            'endDate' => 'nullable|date',
            'end_date' => 'nullable|date',
            'totalBudget' => 'sometimes|required|numeric|min:0',
            'total_budget' => 'nullable|numeric|min:0',
            'notes' => 'nullable|string',
            'project_id' => 'nullable|integer',
            'item_id' => 'nullable|integer',
            'projectId' => 'nullable|integer',
            'itemId' => 'nullable|integer',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $data = $request->all();
        $this->ensureAgencyOwnership($request->user(), $campaign);

        // Map camelCase to snake_case
        if ($request->has('budgetType')) $data['budget_type'] = $request->budgetType;
        if ($request->has('totalBudget')) $data['total_budget'] = $request->totalBudget;
        if ($request->has('startDate')) $data['start_date'] = $request->startDate;
        if ($request->has('endDate')) $data['end_date'] = $request->endDate;
        if ($request->has('landingPage')) $data['landing_page'] = $request->landingPage;
        if ($request->has('projectId')) $data['project_id'] = $request->projectId;
        if ($request->has('itemId')) $data['item_id'] = $request->itemId;

        if ($request->has('projectId') || $request->has('itemId') || $request->has('project_id') || $request->has('item_id')) {
            $tenant = Tenant::query()->find($request->user()?->tenant_id);
            $isGeneral = strtolower(trim((string) ($tenant?->company_type ?? ''))) === 'general';
            if ($isGeneral) {
                if (empty($data['item_id'])) {
                    return response()->json(['errors' => ['itemId' => ['Item is required.']]], 422);
                }
                $data['project_id'] = null;
            } else {
                if (empty($data['project_id'])) {
                    return response()->json(['errors' => ['projectId' => ['Project is required.']]], 422);
                }
                $data['item_id'] = null;
            }
        }
        $data['agency_id'] = $this->resolveAgencyIdForWrite($request, $request->user()) ?? $campaign->agency_id;
        if ($request->has('billingModel')) {
            $meta = $campaign->meta_data ?? [];
            $meta['billing_model'] = $request->billingModel;
            if ($request->has('meta_data') && is_array($request->meta_data)) {
                $meta = array_merge($meta, $request->meta_data);
            }
            $data['meta_data'] = $meta;
        }

        $campaign->update($data);

        return (new CampaignResource($campaign->fresh()->load(['project:id,name', 'item:id,name'])))
            ->additional(['message' => 'Campaign updated successfully']);
    }

    /**
     * Link a Meta/Google campaign to a Project (real estate) or Item (general).
     */
    public function linkInventory(Request $request, Campaign $campaign)
    {
        $this->ensureAgencyOwnership($request->user(), $campaign);

        $tenant = Tenant::query()->find($request->user()->tenant_id);
        $companyType = strtolower(trim((string) ($tenant?->company_type ?? '')));
        $isGeneral = $companyType === 'general';

        $validated = $request->validate([
            'project_id' => 'nullable|integer',
            'item_id' => 'nullable|integer',
            'projectId' => 'nullable|integer',
            'itemId' => 'nullable|integer',
        ]);

        $projectId = $validated['project_id'] ?? $validated['projectId'] ?? null;
        $itemId = $validated['item_id'] ?? $validated['itemId'] ?? null;

        if ($isGeneral) {
            if (! $itemId) {
                throw ValidationException::withMessages([
                    'item_id' => ['Item is required for general companies.'],
                ]);
            }
            $item = Item::query()
                ->where('tenant_id', $request->user()->tenant_id)
                ->where('id', $itemId)
                ->first();
            if (! $item) {
                throw ValidationException::withMessages([
                    'item_id' => ['Selected item was not found for this tenant.'],
                ]);
            }
            $campaign->forceFill([
                'item_id' => $item->id,
                'project_id' => null,
            ])->save();
        } else {
            if (! $projectId) {
                throw ValidationException::withMessages([
                    'project_id' => ['Project is required for real-estate companies.'],
                ]);
            }
            $project = Project::query()
                ->where('tenant_id', $request->user()->tenant_id)
                ->where('id', $projectId)
                ->first();
            if (! $project) {
                throw ValidationException::withMessages([
                    'project_id' => ['Selected project was not found for this tenant.'],
                ]);
            }
            $campaign->forceFill([
                'project_id' => $project->id,
                'item_id' => null,
            ])->save();
        }

        return (new CampaignResource($campaign->fresh()->load(['project:id,name', 'item:id,name'])))
            ->additional(['message' => 'Campaign linked successfully']);
    }

    public function recordAction(Request $request, Campaign $campaign)
    {
        $this->ensureAgencyOwnership($request->user(), $campaign);
        $validated = $request->validate([
            'action' => 'required|string',
            'amount' => 'nullable|numeric'
        ]);

        app(\App\Services\CampaignBillingService::class)
            ->recordCpaAction($campaign, $validated['action'], $validated['amount'] ?? null);

        return (new CampaignResource($campaign->fresh()))
            ->additional(['message' => 'CPA action recorded']);
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Campaign $campaign)
    {
        $this->ensureAgencyOwnership(request()->user(), $campaign);
        $campaign->delete();
        return response()->json(['message' => 'Campaign deleted successfully']);
    }
}
