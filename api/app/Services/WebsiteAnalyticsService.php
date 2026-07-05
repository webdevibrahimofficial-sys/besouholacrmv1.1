<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\Tenant;
use App\Models\WebsiteEvent;
use App\Models\WebsiteIntakeLog;
use App\Models\WebsitePageView;
use App\Models\WebsiteSession;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WebsiteAnalyticsService
{
    public const ALLOWED_EVENTS = [
        'page_view',
        'cta_click',
        'form_view',
        'form_start',
        'form_submit',
        'form_error',
        'phone_click',
        'whatsapp_click',
        'service_view',
        'scroll_25',
        'scroll_50',
        'scroll_75',
        'scroll_100',
        'lead_leak_detector_card_view',
        'lead_leak_detector_completed',
        'lead_leak_detector_result_view',
        'lead_leak_detector_open',
        'lead_leak_detector_close',
        'lead_leak_detector_start',
        'lead_leak_detector_question_answered',
        'lead_leak_detector_report_cta_click',
        'lead_leak_detector_demo_cta_click',
        'lead_leak_detector_lead_form_view',
        'lead_leak_detector_lead_form_start',
        'lead_leak_detector_lead_form_error',
        'lead_leak_detector_lead_form_submit',
        'lead_leak_detector_lead_form_success',
    ];

    public function recordEvent(string $tenantSlug, array $payload, Request $request): array
    {
        $tenant = Tenant::query()
            ->where('slug', $tenantSlug)
            ->where('status', 'active')
            ->first();

        if (!$tenant) {
            throw new \InvalidArgumentException('Invalid tenant slug.');
        }

        $tenantId = (int) $tenant->id;
        $sessionId = trim((string) ($payload['session_id'] ?? ''));
        $eventName = trim((string) ($payload['event_name'] ?? ''));
        $occurredAt = $this->resolveOccurredAt($payload['timestamp'] ?? null);
        $utmSource = $this->normalizeTrackingValue($payload['utm_source'] ?? null, true);
        $utmMedium = $this->normalizeTrackingValue($payload['utm_medium'] ?? null, true);
        $utmCampaign = $this->normalizeTrackingValue($payload['utm_campaign'] ?? null, false);

        if ($sessionId === '' || $eventName === '') {
            throw new \InvalidArgumentException('session_id and event_name are required.');
        }

        if (!in_array($eventName, self::ALLOWED_EVENTS, true)) {
            throw new \InvalidArgumentException('Unsupported event_name.');
        }

        $session = WebsiteSession::withoutGlobalScopes()->firstOrCreate(
            [
                'tenant_id' => $tenantId,
                'session_id' => $sessionId,
            ],
            [
                'first_page_url' => $payload['page_url'] ?? null,
                'first_page_path' => $payload['page_path'] ?? null,
                'first_referrer' => $payload['referrer'] ?? null,
                'utm_source' => $utmSource,
                'utm_campaign' => $utmCampaign,
                'utm_medium' => $utmMedium,
                'device' => $payload['device'] ?? null,
                'browser' => $payload['browser'] ?? null,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'started_at' => $occurredAt,
                'last_seen_at' => $occurredAt,
            ]
        );

        if (!$session->wasRecentlyCreated) {
            $session->forceFill(['last_seen_at' => $occurredAt])->save();
        }

        $event = WebsiteEvent::withoutGlobalScopes()->create([
            'tenant_id' => $tenantId,
            'website_session_id' => $session->id,
            'session_id' => $sessionId,
            'event_name' => $eventName,
            'page_url' => $payload['page_url'] ?? null,
            'page_path' => $payload['page_path'] ?? null,
            'form_name' => $payload['form_name'] ?? null,
            'service_slug' => $payload['service_slug'] ?? null,
            'utm_source' => $utmSource,
            'utm_campaign' => $utmCampaign,
            'utm_medium' => $utmMedium,
            'referrer' => $payload['referrer'] ?? null,
            'device' => $payload['device'] ?? null,
            'browser' => $payload['browser'] ?? null,
            'meta' => is_array($payload['meta'] ?? null) ? $payload['meta'] : null,
            'occurred_at' => $occurredAt,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        if ($eventName === 'page_view') {
            WebsitePageView::withoutGlobalScopes()->create([
                'tenant_id' => $tenantId,
                'website_session_id' => $session->id,
                'session_id' => $sessionId,
                'page_url' => $payload['page_url'] ?? null,
                'page_path' => $payload['page_path'] ?? null,
                'referrer' => $payload['referrer'] ?? null,
                'utm_source' => $utmSource,
                'utm_campaign' => $utmCampaign,
                'utm_medium' => $utmMedium,
                'device' => $payload['device'] ?? null,
                'browser' => $payload['browser'] ?? null,
                'viewed_at' => $occurredAt,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);

            $session->increment('page_views_count');
        }

        $session->increment('events_count');

        return [
            'event_id' => $event->id,
            'session_id' => $sessionId,
            'website_session_id' => $session->id,
        ];
    }

    public function overview(int $tenantId, ?string $from = null, ?string $to = null, array $filters = []): array
    {
        [$start, $end] = $this->resolveRange($from, $to);
        $filters = $this->normalizeFilters($filters);

        $sessions = $this->applySessionFilters(
            WebsiteSession::query()->where('tenant_id', $tenantId),
            $filters
        )
            ->whereBetween('started_at', [$start, $end])
            ->count();

        $visitors = $this->applySessionFilters(
            WebsiteSession::query()->where('tenant_id', $tenantId),
            $filters
        )
            ->whereBetween('started_at', [$start, $end])
            ->distinct('session_id')
            ->count('session_id');

        $pageViews = $this->applyPageViewFilters(
            WebsitePageView::query()->where('tenant_id', $tenantId),
            $filters
        )
            ->whereBetween('viewed_at', [$start, $end])
            ->count();

        $leads = $this->applyLeadFilters(
            Lead::query()->where('tenant_id', $tenantId),
            $filters
        )
            ->whereBetween('created_at', [$start, $end])
            ->where(function ($query) {
                $query->whereNotNull('website_connection_id')
                    ->orWhere('meta_data->integration', 'website');
            })
            ->count();

        $ctaClicks = $this->countEvents($tenantId, 'cta_click', $start, $end, $filters);
        $formStarts = $this->countEvents($tenantId, 'form_start', $start, $end, $filters);
        $formSubmits = $this->countEvents($tenantId, 'form_submit', $start, $end, $filters);
        $formErrors = $this->countEvents($tenantId, 'form_error', $start, $end, $filters);

        $failedIntakes = WebsiteIntakeLog::query()
            ->where('tenant_id', $tenantId)
            ->whereBetween('created_at', [$start, $end])
            ->whereIn('status', ['validation_failed', 'invalid_key', 'inactive_connection', 'blocked_origin', 'exception'])
            ->count();

        $conversionRate = $sessions > 0 ? round(($leads / $sessions) * 100, 2) : 0.0;

        return [
            'range' => ['from' => $start->toDateString(), 'to' => $end->toDateString()],
            'visitors' => $visitors,
            'sessions' => $sessions,
            'page_views' => $pageViews,
            'leads' => $leads,
            'conversion_rate' => $conversionRate,
            'cta_clicks' => $ctaClicks,
            'form_starts' => $formStarts,
            'form_submits' => $formSubmits,
            'form_errors' => $formErrors,
            'failed_intakes' => $failedIntakes,
            'top_pages' => $this->topPages($tenantId, $start, $end, 5, $filters),
            'top_forms' => $this->topForms($tenantId, $start, $end, 5, $filters),
            'top_campaigns' => $this->topCampaigns($tenantId, $start, $end, 5, $filters),
        ];
    }

    public function pages(int $tenantId, ?string $from = null, ?string $to = null, array $filters = []): array
    {
        [$start, $end] = $this->resolveRange($from, $to);
        $filters = $this->normalizeFilters($filters);

        $rows = $this->applyPageViewFilters(
            WebsitePageView::query()->where('tenant_id', $tenantId),
            $filters
        )
            ->select('page_path', DB::raw('COUNT(*) as views'), DB::raw('COUNT(DISTINCT session_id) as unique_visitors'))
            ->whereBetween('viewed_at', [$start, $end])
            ->whereNotNull('page_path')
            ->groupBy('page_path')
            ->orderByDesc('views')
            ->limit(50)
            ->get();

        $formStarts = $this->applyEventFilters(
            WebsiteEvent::query()->where('tenant_id', $tenantId),
            $filters
        )
            ->select('page_path', DB::raw('COUNT(*) as total'))
            ->where('event_name', 'form_start')
            ->whereBetween('occurred_at', [$start, $end])
            ->groupBy('page_path')
            ->pluck('total', 'page_path');

        $formSubmits = $this->applyEventFilters(
            WebsiteEvent::query()->where('tenant_id', $tenantId),
            $filters
        )
            ->select('page_path', DB::raw('COUNT(*) as total'))
            ->where('event_name', 'form_submit')
            ->whereBetween('occurred_at', [$start, $end])
            ->groupBy('page_path')
            ->pluck('total', 'page_path');

        return $rows->map(function ($row) use ($formStarts, $formSubmits) {
            $starts = (int) ($formStarts[$row->page_path] ?? 0);
            $submits = (int) ($formSubmits[$row->page_path] ?? 0);

            return [
                'page_path' => $row->page_path,
                'views' => (int) $row->views,
                'unique_visitors' => (int) $row->unique_visitors,
                'form_starts' => $starts,
                'form_submits' => $submits,
                'conversion_rate' => $starts > 0 ? round(($submits / $starts) * 100, 2) : 0.0,
            ];
        })->values()->all();
    }

    public function forms(int $tenantId, ?string $from = null, ?string $to = null, array $filters = []): array
    {
        [$start, $end] = $this->resolveRange($from, $to);
        $filters = $this->normalizeFilters($filters);

        $forms = $this->applyEventFilters(
            WebsiteEvent::query()->where('tenant_id', $tenantId),
            $filters
        )
            ->select('form_name')
            ->whereBetween('occurred_at', [$start, $end])
            ->whereNotNull('form_name')
            ->distinct()
            ->pluck('form_name');

        return $forms->map(function ($formName) use ($tenantId, $start, $end, $filters) {
            $views = $this->countFormEvents($tenantId, 'form_view', $formName, $start, $end, $filters);
            $starts = $this->countFormEvents($tenantId, 'form_start', $formName, $start, $end, $filters);
            $submits = $this->countFormEvents($tenantId, 'form_submit', $formName, $start, $end, $filters);
            $errors = $this->countFormEvents($tenantId, 'form_error', $formName, $start, $end, $filters);

            return [
                'form_name' => $formName,
                'views' => $views,
                'starts' => $starts,
                'submits' => $submits,
                'errors' => $errors,
                'conversion_rate' => $starts > 0 ? round(($submits / $starts) * 100, 2) : 0.0,
            ];
        })->sortByDesc('submits')->values()->all();
    }

    public function campaigns(int $tenantId, ?string $from = null, ?string $to = null, array $filters = []): array
    {
        [$start, $end] = $this->resolveRange($from, $to);
        $filters = $this->normalizeFilters($filters);

        $rows = $this->applySessionFilters(
            WebsiteSession::query()->where('tenant_id', $tenantId),
            $filters
        )
            ->select(
                'utm_source',
                'utm_medium',
                'utm_campaign',
                DB::raw('COUNT(*) as sessions')
            )
            ->whereBetween('started_at', [$start, $end])
            ->where(function ($query) {
                $query->whereNotNull('utm_source')
                    ->orWhereNotNull('utm_campaign')
                    ->orWhereNotNull('utm_medium');
            })
            ->groupBy('utm_source', 'utm_medium', 'utm_campaign')
            ->orderByDesc('sessions')
            ->limit(50)
            ->get();

        return $rows->map(function ($row) use ($tenantId, $start, $end, $filters) {
            $leadQuery = $this->applyLeadFilters(
                Lead::query()->where('tenant_id', $tenantId),
                $filters
            )
                ->whereBetween('created_at', [$start, $end])
                ->where(function ($query) {
                    $query->whereNotNull('website_connection_id')
                        ->orWhere('meta_data->integration', 'website');
                });

            if ($row->utm_source) {
                $leadQuery->where('meta_data->utm_source', $row->utm_source);
            }
            if ($row->utm_campaign) {
                $leadQuery->where('meta_data->utm_campaign', $row->utm_campaign);
            }
            if ($row->utm_medium) {
                $leadQuery->where('meta_data->utm_medium', $row->utm_medium);
            }

            $leads = $leadQuery->count();
            $sessions = (int) $row->sessions;

            return [
                'utm_source' => $row->utm_source,
                'utm_medium' => $row->utm_medium,
                'utm_campaign' => $row->utm_campaign,
                'sessions' => $sessions,
                'leads' => $leads,
                'conversion_rate' => $sessions > 0 ? round(($leads / $sessions) * 100, 2) : 0.0,
            ];
        })->values()->all();
    }

    public function filterOptions(int $tenantId, ?string $from = null, ?string $to = null): array
    {
        [$start, $end] = $this->resolveRange($from, $to);

        $sessionQuery = WebsiteSession::query()
            ->where('tenant_id', $tenantId)
            ->whereBetween('started_at', [$start, $end]);

        return [
            'utm_sources' => (clone $sessionQuery)
                ->whereNotNull('utm_source')
                ->where('utm_source', '!=', '')
                ->distinct()
                ->orderBy('utm_source')
                ->pluck('utm_source')
                ->values()
                ->all(),
            'utm_mediums' => (clone $sessionQuery)
                ->whereNotNull('utm_medium')
                ->where('utm_medium', '!=', '')
                ->distinct()
                ->orderBy('utm_medium')
                ->pluck('utm_medium')
                ->values()
                ->all(),
            'utm_campaigns' => (clone $sessionQuery)
                ->whereNotNull('utm_campaign')
                ->where('utm_campaign', '!=', '')
                ->distinct()
                ->orderBy('utm_campaign')
                ->pluck('utm_campaign')
                ->values()
                ->all(),
            'devices' => (clone $sessionQuery)
                ->whereNotNull('device')
                ->where('device', '!=', '')
                ->distinct()
                ->orderBy('device')
                ->pluck('device')
                ->values()
                ->all(),
        ];
    }

    private function topPages(int $tenantId, Carbon $start, Carbon $end, int $limit, array $filters = []): array
    {
        return $this->applyPageViewFilters(
            WebsitePageView::query()->where('tenant_id', $tenantId),
            $this->normalizeFilters($filters)
        )
            ->select('page_path', DB::raw('COUNT(*) as views'))
            ->whereBetween('viewed_at', [$start, $end])
            ->whereNotNull('page_path')
            ->groupBy('page_path')
            ->orderByDesc('views')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => ['page_path' => $row->page_path, 'views' => (int) $row->views])
            ->all();
    }

    private function topForms(int $tenantId, Carbon $start, Carbon $end, int $limit, array $filters = []): array
    {
        return $this->applyEventFilters(
            WebsiteEvent::query()->where('tenant_id', $tenantId),
            $this->normalizeFilters($filters)
        )
            ->select('form_name', DB::raw('COUNT(*) as submits'))
            ->where('event_name', 'form_submit')
            ->whereBetween('occurred_at', [$start, $end])
            ->whereNotNull('form_name')
            ->groupBy('form_name')
            ->orderByDesc('submits')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => ['form_name' => $row->form_name, 'submits' => (int) $row->submits])
            ->all();
    }

    private function topCampaigns(int $tenantId, Carbon $start, Carbon $end, int $limit, array $filters = []): array
    {
        return $this->applySessionFilters(
            WebsiteSession::query()->where('tenant_id', $tenantId),
            $this->normalizeFilters($filters)
        )
            ->select('utm_source', 'utm_campaign', DB::raw('COUNT(*) as sessions'))
            ->whereBetween('started_at', [$start, $end])
            ->whereNotNull('utm_campaign')
            ->groupBy('utm_source', 'utm_campaign')
            ->orderByDesc('sessions')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'utm_source' => $row->utm_source,
                'utm_campaign' => $row->utm_campaign,
                'sessions' => (int) $row->sessions,
            ])
            ->all();
    }

    private function countEvents(int $tenantId, string $eventName, Carbon $start, Carbon $end, array $filters = []): int
    {
        return $this->applyEventFilters(
            WebsiteEvent::query()->where('tenant_id', $tenantId),
            $this->normalizeFilters($filters)
        )
            ->where('event_name', $eventName)
            ->whereBetween('occurred_at', [$start, $end])
            ->count();
    }

    private function countFormEvents(int $tenantId, string $eventName, string $formName, Carbon $start, Carbon $end, array $filters = []): int
    {
        return $this->applyEventFilters(
            WebsiteEvent::query()->where('tenant_id', $tenantId),
            $this->normalizeFilters($filters)
        )
            ->where('event_name', $eventName)
            ->where('form_name', $formName)
            ->whereBetween('occurred_at', [$start, $end])
            ->count();
    }

    private function normalizeFilters(array $filters): array
    {
        return [
            'utm_source' => $this->normalizeFilterValue($filters['utm_source'] ?? null),
            'utm_medium' => $this->normalizeFilterValue($filters['utm_medium'] ?? null),
            'utm_campaign' => $this->normalizeFilterValue($filters['utm_campaign'] ?? null),
            'device' => $this->normalizeFilterValue($filters['device'] ?? null),
        ];
    }

    private function normalizeFilterValue(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $value = trim($value);

        return $value === '' ? null : $value;
    }

    private function normalizeTrackingValue(mixed $value, bool $lowercase = true): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $value = trim($value);

        if ($value === '') {
            return null;
        }

        return $lowercase ? strtolower($value) : $value;
    }

    private function applySessionFilters(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['utm_source'] ?? null, fn (Builder $builder, string $value) => $builder->where('utm_source', $value))
            ->when($filters['utm_medium'] ?? null, fn (Builder $builder, string $value) => $builder->where('utm_medium', $value))
            ->when($filters['utm_campaign'] ?? null, fn (Builder $builder, string $value) => $builder->where('utm_campaign', $value))
            ->when($filters['device'] ?? null, fn (Builder $builder, string $value) => $builder->where('device', $value));
    }

    private function applyPageViewFilters(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['utm_source'] ?? null, fn (Builder $builder, string $value) => $builder->where('utm_source', $value))
            ->when($filters['utm_medium'] ?? null, fn (Builder $builder, string $value) => $builder->where('utm_medium', $value))
            ->when($filters['utm_campaign'] ?? null, fn (Builder $builder, string $value) => $builder->where('utm_campaign', $value))
            ->when($filters['device'] ?? null, fn (Builder $builder, string $value) => $builder->where('device', $value));
    }

    private function applyEventFilters(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['utm_source'] ?? null, fn (Builder $builder, string $value) => $builder->where('utm_source', $value))
            ->when($filters['utm_medium'] ?? null, fn (Builder $builder, string $value) => $builder->where('utm_medium', $value))
            ->when($filters['utm_campaign'] ?? null, fn (Builder $builder, string $value) => $builder->where('utm_campaign', $value))
            ->when($filters['device'] ?? null, fn (Builder $builder, string $value) => $builder->where('device', $value));
    }

    private function applyLeadFilters(Builder $query, array $filters): Builder
    {
        return $query
            ->when($filters['utm_source'] ?? null, fn (Builder $builder, string $value) => $builder->where('meta_data->utm_source', $value))
            ->when($filters['utm_medium'] ?? null, fn (Builder $builder, string $value) => $builder->where('meta_data->utm_medium', $value))
            ->when($filters['utm_campaign'] ?? null, fn (Builder $builder, string $value) => $builder->where('meta_data->utm_campaign', $value));
    }

    private function resolveRange(?string $from, ?string $to): array
    {
        $end = $to ? Carbon::parse($to)->endOfDay() : now()->endOfDay();
        $start = $from ? Carbon::parse($from)->startOfDay() : now()->subDays(30)->startOfDay();

        return [$start, $end];
    }

    private function resolveOccurredAt(?string $timestamp): Carbon
    {
        if (!$timestamp) {
            return now();
        }

        try {
            return Carbon::parse($timestamp);
        } catch (\Throwable) {
            return now();
        }
    }
}
