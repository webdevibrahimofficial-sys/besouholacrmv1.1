<?php

namespace App\Http\Controllers;

use App\Http\Requests\StoreWebsiteConnectionRequest;
use App\Http\Requests\UpdateWebsiteConnectionRequest;
use App\Models\Lead;
use App\Models\WebsiteConnection;
use App\Models\WebsiteIntakeLog;
use App\Services\WebsiteApiKeyService;
use App\Services\WebsiteSourceResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\HttpException;

class WebsiteConnectionController extends Controller
{
    public function __construct(
        private readonly WebsiteApiKeyService $apiKeyService,
        private readonly WebsiteSourceResolver $sourceResolver,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        $connections = WebsiteConnection::query()
            ->where('tenant_id', $tenantId)
            ->with(['campaign:id,name', 'source:id,name'])
            ->withCount('leads')
            ->latest()
            ->get();

        return response()->json($connections);
    }

    public function store(StoreWebsiteConnectionRequest $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $keyData = $this->apiKeyService->generate();
        $validated = $request->validated();

        if (empty($validated['default_source_id'])) {
            $validated['default_source_id'] = $this->sourceResolver
                ->getOrCreateWebsiteSourceForTenant($tenantId)
                ->id;
        }

        $connection = WebsiteConnection::create([
            ...$validated,
            'tenant_id' => $tenantId,
            'key_prefix' => $keyData['key_prefix'],
            'api_key_hash' => $keyData['api_key_hash'],
        ]);

        $connection->load(['campaign:id,name', 'source:id,name']);
        $connection->loadCount('leads');

        return response()->json([
            'connection' => $connection,
            'api_key' => $keyData['full_key'],
        ], 201);
    }

    public function update(UpdateWebsiteConnectionRequest $request, int $websiteConnection): JsonResponse
    {
        $connection = $this->resolveTenantConnection($request, $websiteConnection);

        $connection->update($request->validated());
        $connection->load(['campaign:id,name', 'source:id,name']);
        $connection->loadCount('leads');

        return response()->json($connection);
    }

    public function destroy(Request $request, int $websiteConnection): JsonResponse
    {
        $connection = $this->resolveTenantConnection($request, $websiteConnection);
        $connection->delete();

        return response()->noContent();
    }

    public function regenerateKey(Request $request, int $websiteConnection): JsonResponse
    {
        $connection = $this->resolveTenantConnection($request, $websiteConnection);
        $keyData = $this->apiKeyService->generate();

        $connection->update([
            'key_prefix' => $keyData['key_prefix'],
            'api_key_hash' => $keyData['api_key_hash'],
        ]);

        return response()->json([
            'id' => $connection->id,
            'key_prefix' => $connection->fresh()->key_prefix,
            'masked_key' => $connection->fresh()->masked_key,
            'api_key' => $keyData['full_key'],
        ]);
    }

    public function stats(Request $request, int $websiteConnection): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $connection = $this->resolveTenantConnection($request, $websiteConnection);

        $baseQuery = Lead::query()
            ->where('tenant_id', $tenantId)
            ->where('website_connection_id', $connection->id);

        $acceptedStatuses = ['success', 'duplicate'];
        $total = (clone $baseQuery)->count();
        $thisMonth = (clone $baseQuery)
            ->whereMonth('created_at', now()->month)
            ->whereYear('created_at', now()->year)
            ->count();
        $today = (clone $baseQuery)->whereDate('created_at', today())->count();
        $lastLead = (clone $baseQuery)->latest('created_at')->value('created_at');

        $logsBaseQuery = WebsiteIntakeLog::query()
            ->where('tenant_id', $tenantId)
            ->where('website_connection_id', $connection->id);

        $acceptedRequests = (clone $logsBaseQuery)
            ->whereIn('status', $acceptedStatuses)
            ->count();
        $rejectedRequests = (clone $logsBaseQuery)
            ->whereNotIn('status', $acceptedStatuses)
            ->count();
        $duplicateCount = (clone $logsBaseQuery)
            ->where('status', 'duplicate')
            ->count();
        $blockedOriginsCount = (clone $logsBaseQuery)
            ->where('status', 'blocked_origin')
            ->count();

        $lastSuccessfulAttempt = (clone $logsBaseQuery)
            ->whereIn('status', $acceptedStatuses)
            ->with('lead:id,name,phone,email')
            ->latest('created_at')
            ->first();

        $lastFailedAttempt = (clone $logsBaseQuery)
            ->whereNotIn('status', $acceptedStatuses)
            ->latest('created_at')
            ->first();

        $analyticsLogs = (clone $logsBaseQuery)
            ->get(['status', 'origin', 'payload', 'created_at']);

        $dailyLeads = (clone $baseQuery)
            ->where('created_at', '>=', now()->subDays(30))
            ->selectRaw('DATE(created_at) as date, COUNT(*) as count')
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        $bySource = (clone $baseQuery)
            ->selectRaw('source, COUNT(*) as count')
            ->groupBy('source')
            ->orderByDesc('count')
            ->get();

        $totalRequests = $analyticsLogs->count();
        $acceptedLogs = $analyticsLogs->whereIn('status', $acceptedStatuses)->values();
        $recentLogs = $analyticsLogs->where('created_at', '>=', now()->subDays(29))->values();

        $topPages = $this->summarizeTopValues(
            $acceptedLogs,
            fn (WebsiteIntakeLog $log) => $this->extractPageUrl($log)
        );

        $topForms = $this->summarizeTopValues(
            $acceptedLogs,
            fn (WebsiteIntakeLog $log) => $this->extractFormName($log)
        );

        $topOrigins = $this->summarizeTopValues(
            $acceptedLogs,
            fn (WebsiteIntakeLog $log) => $this->normalizeAnalyticsValue($log->origin)
        );

        $leadsOverTime = collect(range(0, 29))
            ->map(function (int $offset) use ($recentLogs, $acceptedStatuses): array {
                $date = now()->subDays(29 - $offset)->toDateString();
                $logsForDate = $recentLogs->filter(
                    fn (WebsiteIntakeLog $log) => optional($log->created_at)?->toDateString() === $date
                );

                $acceptedForDate = $logsForDate->whereIn('status', $acceptedStatuses)->count();
                $duplicatesForDate = $logsForDate->where('status', 'duplicate')->count();
                $rejectedForDate = $logsForDate->whereNotIn('status', $acceptedStatuses)->count();

                return [
                    'date' => $date,
                    'accepted' => $acceptedForDate,
                    'duplicates' => $duplicatesForDate,
                    'rejected' => $rejectedForDate,
                    'total' => $logsForDate->count(),
                ];
            })
            ->values();

        $duplicateRate = $totalRequests > 0
            ? round(($duplicateCount / $totalRequests) * 100, 2)
            : 0.0;

        $rejectionRate = $totalRequests > 0
            ? round(($rejectedRequests / $totalRequests) * 100, 2)
            : 0.0;

        return response()->json([
            'total' => $total,
            'this_month' => $thisMonth,
            'today' => $today,
            'last_lead' => $lastLead ? \Illuminate\Support\Carbon::parse($lastLead)->diffForHumans() : null,
            'total_requests' => $totalRequests,
            'accepted_requests' => $acceptedRequests,
            'rejected_requests' => $rejectedRequests,
            'duplicate_count' => $duplicateCount,
            'blocked_origins_count' => $blockedOriginsCount,
            'duplicate_rate' => $duplicateRate,
            'rejection_rate' => $rejectionRate,
            'last_successful_lead' => $lastSuccessfulAttempt ? [
                'created_at' => optional($lastSuccessfulAttempt->created_at)?->toIso8601String(),
                'status' => $lastSuccessfulAttempt->status,
                'page_url' => $lastSuccessfulAttempt->page_url,
                'origin' => $lastSuccessfulAttempt->origin,
                'lead' => $lastSuccessfulAttempt->lead ? [
                    'id' => $lastSuccessfulAttempt->lead->id,
                    'name' => $lastSuccessfulAttempt->lead->name,
                    'phone' => $lastSuccessfulAttempt->lead->phone,
                    'email' => $lastSuccessfulAttempt->lead->email,
                ] : null,
            ] : null,
            'last_failed_attempt' => $lastFailedAttempt ? [
                'created_at' => optional($lastFailedAttempt->created_at)?->toIso8601String(),
                'status' => $lastFailedAttempt->status,
                'error_message' => $lastFailedAttempt->error_message,
                'origin' => $lastFailedAttempt->origin,
                'page_url' => $lastFailedAttempt->page_url,
            ] : null,
            'daily_leads' => $dailyLeads,
            'by_source' => $bySource,
            'top_pages' => $topPages,
            'top_forms' => $topForms,
            'top_origins' => $topOrigins,
            'leads_over_time' => $leadsOverTime,
        ]);
    }

    private function summarizeTopValues(Collection $logs, callable $resolver, int $limit = 5): array
    {
        return $logs
            ->map(function (WebsiteIntakeLog $log) use ($resolver) {
                return $this->normalizeAnalyticsValue($resolver($log));
            })
            ->filter()
            ->countBy()
            ->sortDesc()
            ->take($limit)
            ->map(fn (int $count, string $label) => [
                'label' => $label,
                'count' => $count,
            ])
            ->values()
            ->all();
    }

    private function extractPageUrl(WebsiteIntakeLog $log): ?string
    {
        $payload = is_array($log->payload) ? $log->payload : [];

        return $payload['meta']['page_url']
            ?? $payload['page_url']
            ?? null;
    }

    private function extractFormName(WebsiteIntakeLog $log): ?string
    {
        $payload = is_array($log->payload) ? $log->payload : [];

        return $payload['meta']['form_name']
            ?? $payload['form_name']
            ?? null;
    }

    private function normalizeAnalyticsValue(mixed $value): ?string
    {
        $normalized = trim((string) $value);

        return $normalized !== '' ? $normalized : null;
    }

    public function test(Request $request, int $websiteConnection): JsonResponse
    {
        $connection = $this->resolveTenantConnection($request, $websiteConnection);

        try {
            $intakeService = app(\App\Services\WebsiteLeadIntakeService::class);
            $result = $intakeService->handleTest($connection, $request);

            if (!$result['success']) {
                return response()->json($result, 422);
            }

            return response()->json($result, 201);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
                'status' => match ($e->getStatusCode()) {
                    422 => 'inactive_connection',
                    default => 'exception',
                },
            ], $e->getStatusCode());
        }
    }

    private function resolveTenantConnection(Request $request, int $websiteConnection): WebsiteConnection
    {
        $connection = WebsiteConnection::withoutGlobalScopes()->find($websiteConnection);

        if (!$connection) {
            abort(404);
        }

        if ((int) $connection->tenant_id !== (int) $request->user()->tenant_id) {
            throw new HttpException(403, 'You are not authorized to access this website connection.');
        }

        return $connection;
    }
}
