<?php

namespace App\Services;

use App\Models\CrmSetting;
use App\Models\Item;
use App\Models\Lead;
use App\Models\User;
use App\Models\WebsiteIntakeLog;
use App\Notifications\DuplicateLeadWarning;
use App\Notifications\LeadCreated;
use App\Support\PhoneNormalizer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpKernel\Exception\HttpException;

class WebsiteLeadIntakeService
{
    private function applyDuplicateWorkflowScope($query, ?int $tenantId, ?string $workflowKey): void
    {
        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $normalizedWorkflow = strtolower(trim((string) ($workflowKey ?? '')));
        if ($normalizedWorkflow === '' || !\Illuminate\Support\Facades\Schema::hasColumn('leads', 'workflow_key')) {
            return;
        }

        $query->where('workflow_key', $normalizedWorkflow);

        if ($normalizedWorkflow === TelesalesService::WORKFLOW_TELESALES
            && \Illuminate\Support\Facades\Schema::hasColumn('leads', 'transferred_to_sales_at')) {
            $query->whereNull('transferred_to_sales_at');
        }
    }

    public function __construct(
        private readonly WebsiteApiKeyService $apiKeyService,
        private readonly WebsiteSourceResolver $sourceResolver,
        private readonly LeadRotationEngine $rotationEngine,
        private readonly LeadLeakReportService $leadLeakReportService,
    ) {
    }

    public function handle(string $apiKey, array $payload, Request $request): array
    {
        $connection = $this->apiKeyService->resolveConnection($apiKey);

        if (!$connection) {
            $this->logIntake(null, null, 'invalid_key', $payload, 'Invalid API key.', $request);
            throw new HttpException(401, 'Invalid website API key.');
        }

        if (!$connection->is_active) {
            $this->logIntake((int) $connection->tenant_id, (int) $connection->id, 'inactive_connection', $payload, 'Website connection is inactive.', $request);
            throw new HttpException(401, 'Website connection is inactive.');
        }

        $origin = $request->headers->get('Origin');
        if (!$this->isOriginAllowed($connection->allowed_origins, (bool) $connection->allow_all_origins_for_testing, $origin)) {
            $this->logIntake((int) $connection->tenant_id, (int) $connection->id, 'blocked_origin', $payload, 'Origin is not allowed for this website connection.', $request);
            throw new HttpException(403, 'Origin is not allowed for this website connection.');
        }

        $processed = $this->processResolvedConnection($connection, $payload, $request);

        return [
            'lead' => $processed['lead']->fresh(['creator:id,name', 'assignedAgent:id,name']),
            'status' => $processed['status'],
            'log_id' => $processed['log']?->id,
            'report_url' => $processed['report_url'] ?? null,
            'report_path' => $processed['report_path'] ?? null,
        ];
    }

    private function makeAbsoluteStorageUrl(Request $request, string $path): string
    {
        if (preg_match('#^tenants/(\d+)/leads/(\d+)/attachments/(lead-leak-report-\d+\.pdf)$#', $path, $matches)) {
            return sprintf(
                '%s/api/public/lead-leak-reports/%d/%d/%s',
                rtrim($request->getSchemeAndHttpHost(), '/'),
                (int) $matches[1],
                (int) $matches[2],
                $matches[3]
            );
        }

        return rtrim($request->getSchemeAndHttpHost(), '/') . Storage::disk('public')->url($path);
    }

    private function createOrUpdateLead(int $tenantId, array $data, string $rawPhone): array
    {
        $crm = CrmSetting::first();
        $enableDup = is_array($crm?->settings) ? (bool) ($crm->settings['duplicationSystem'] ?? false) : false;
        $workflowKey = strtolower(trim((string) ($data['workflow_key'] ?? '')));

        $duplicateOfId = null;
        $variantsForSearch = [];

        if ($enableDup && $rawPhone !== '' && $data['phone']) {
            $variantsForSearch = PhoneNormalizer::variantsForSearch($rawPhone);
            $variantsForSearch = !empty($variantsForSearch) ? $variantsForSearch : [$data['phone']];

            $base = Lead::query();
            $this->applyDuplicateWorkflowScope($base, $tenantId, $workflowKey);
            $isDuplicate = (clone $base)->whereIn('phone', $variantsForSearch)->exists();

            if ($isDuplicate) {
                $original = (clone $base)->whereIn('phone', $variantsForSearch)
                    ->where(function ($query) {
                        $query->whereNull('status')->orWhere('status', '!=', 'duplicate');
                    })
                    ->orderBy('id', 'asc')
                    ->first();

                if (!$original) {
                    $original = (clone $base)->whereIn('phone', $variantsForSearch)->orderBy('id', 'asc')->first();
                }

                $duplicateOfId = $this->resolveDuplicateRootId($original, $tenantId);

                $meta = is_array($data['meta_data'] ?? null) ? ($data['meta_data'] ?? []) : [];
                $enteredStage = trim((string) ($data['stage'] ?? ''));
                if ($enteredStage !== '') {
                    $meta['entered_stage'] = $enteredStage;
                }
                $meta['duplicate_of'] = $duplicateOfId;
                $attempt = $this->buildDuplicateAttemptMeta($data, [
                    'phone' => $data['phone'],
                    'duplicate_of' => $duplicateOfId,
                    'stage' => $enteredStage,
                ]);
                $meta = $this->bumpDuplicateAttemptMeta($meta, $attempt);

                $data['meta_data'] = $meta;
                $data['status'] = 'duplicate';
                $data['stage'] = 'Duplicate';

                $existingDup = $this->findActiveDuplicateLead($tenantId, $variantsForSearch, (int) $duplicateOfId);
                if ($existingDup) {
                    $update = $data;
                    unset($update['tenant_id'], $update['created_by']);
                    $existingDup->fill($update);
                    $existingDup->save();

                    return [$existingDup, 'updated_duplicate'];
                }
            }
        }

        $lead = Lead::create($data);

        if (empty($lead->assigned_to) && $this->rotationEngine->isNewLeadStage($lead)) {
            $settings = $this->rotationEngine->getSettings($tenantId);
            if ($settings->allow_assign_rotation && $this->rotationEngine->isWithinWindow((string) $settings->work_from, (string) $settings->work_to, now())) {
                $filters = $this->rotationEngine->resolveLeadFilters($lead, $tenantId);
                $queueKey = $this->rotationEngine->buildQueueKey($lead, $filters);
                $eligible = $this->rotationEngine->getEligibleAssignUserIds($tenantId, $filters);
                $next = $this->rotationEngine->pickNextUserId($tenantId, $queueKey, $eligible);
                if ($next) {
                    $this->rotationEngine->assignLeadToUser($lead, $next);
                }
            }
        }

        if ($enableDup && $duplicateOfId) {
            $originalLead = Lead::find($duplicateOfId);
            if ($originalLead) {
                $recipients = $this->getDuplicateNotificationRecipients($tenantId);
                $notification = new DuplicateLeadWarning($lead, $originalLead);
                foreach ($recipients as $recipient) {
                    try {
                        $recipient->notify($notification);
                    } catch (\Throwable) {
                    }
                }
            }
        }

        return [$lead, $duplicateOfId ? 'created_duplicate' : 'created'];
    }

    private function notifyLeadCreated(Lead $lead, string $result): void
    {
        if (!in_array($result, ['created', 'created_duplicate'], true)) {
            return;
        }

        $leadFresh = $lead->fresh(['assignedAgent:id,name', 'creator:id,name']);
        if (!$leadFresh) {
            return;
        }

        $tenantId = (int) $leadFresh->tenant_id;
        $recipients = User::where('tenant_id', $tenantId)
            ->whereHas('roles', function ($query) {
                $query->whereIn('name', [
                    'Admin',
                    'Tenant Admin',
                    'Sales Admin',
                    'Director',
                    'Operation Manager',
                ]);
            })
            ->get();

        if ($recipients->isEmpty()) {
            return;
        }

        $notification = new LeadCreated($leadFresh, 'Website Intake');

        foreach ($recipients as $recipient) {
            try {
                $recipient->notify($notification);
            } catch (\Throwable) {
            }
        }
    }

    private function resolveCampaignId(int $tenantId, ?int $campaignId): ?int
    {
        if (!$campaignId) {
            return null;
        }

        return \App\Models\Campaign::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->where('id', $campaignId)
            ->value('id');
    }

    private function buildMetaData($connection, array $payload): array
    {
        $existing = is_array($payload['meta'] ?? null) ? $payload['meta'] : [];

        $metaData = [
            'integration' => 'website',
            'connection_id' => $connection->id,
            'connection_name' => $connection->name,
            'form_name' => $existing['form_name'] ?? null,
            'page_url' => $existing['page_url'] ?? null,
            'utm_source' => $existing['utm_source'] ?? null,
            'utm_campaign' => $existing['utm_campaign'] ?? null,
            'utm_medium' => $existing['utm_medium'] ?? null,
            'session_id' => $existing['session_id'] ?? null,
            'device' => $existing['device'] ?? null,
            'browser' => $existing['browser'] ?? null,
            'referrer' => $existing['referrer'] ?? null,
            'submitted_source' => $payload['source'] ?? ($existing['submitted_source'] ?? null),
            'service_interest' => $existing['service_interest'] ?? null,
            'lead_item_id' => $existing['lead_item_id'] ?? null,
            'lead_item_name' => $existing['lead_item_name'] ?? null,
            'payload_meta' => $existing,
        ];

        $diagnostic = $this->extractLeadLeakDiagnostic($payload, $existing);
        if ($diagnostic !== null) {
            $metaData['lead_leak_detector'] = $this->leadLeakReportService->normalizeDiagnostic($diagnostic);
        }

        return $metaData;
    }

    /**
     * Persist a compact diagnostic snapshot as a lead attachment.
     *
     * This keeps the Sales Leakage Score visible in the lead attachments
     * even if downstream PDF generation is skipped or the user prefers a
     * machine-readable summary.
     */
    private function attachLeadLeakDiagnosticSnapshot(Lead $lead, array $diagnostic): ?string
    {
        $normalized = $this->leadLeakReportService->normalizeDiagnostic($diagnostic);

        $path = sprintf(
            'tenants/%d/leads/%d/attachments/lead-leak-summary-%d.json',
            $lead->tenant_id,
            $lead->id,
            $lead->id
        );

        $payload = [
            'lead_id' => $lead->id,
            'lead_name' => $lead->name,
            'generated_at' => now()->toIso8601String(),
            'score' => $normalized['score'],
            'risk_level' => $normalized['risk_level'],
            'top_leaks' => $normalized['top_leaks'],
            'answers' => $normalized['answers'],
            'advice' => $normalized['advice'],
            'cta_type' => $normalized['cta_type'],
            'source_trigger' => $normalized['source_trigger'],
        ];

        Storage::disk('public')->put(
            $path,
            json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );

        $attachments = is_array($lead->attachments) ? $lead->attachments : [];
        $attachments = array_values(array_filter(
            $attachments,
            fn ($attachment) => $attachment !== $path
        ));
        $attachments[] = $path;

        $meta = is_array($lead->meta_data) ? $lead->meta_data : [];
        $meta['lead_leak_detector'] = array_replace(
            is_array($meta['lead_leak_detector'] ?? null) ? $meta['lead_leak_detector'] : [],
            [
                'score' => $normalized['score'],
                'risk_level' => $normalized['risk_level'],
                'top_leaks' => $normalized['top_leaks'],
                'answers' => $normalized['answers'],
                'advice' => $normalized['advice'],
                'cta_type' => $normalized['cta_type'],
                'source_trigger' => $normalized['source_trigger'],
                'snapshot' => [
                    'path' => $path,
                    'name' => 'Sales Leakage Score Snapshot',
                    'mime_type' => 'application/json',
                    'type' => 'diagnostic_snapshot',
                    'generated_at' => now()->toIso8601String(),
                ],
            ]
        );

        $lead->forceFill([
            'attachments' => $attachments,
            'meta_data' => $meta,
        ])->save();

        return $path;
    }

    private function extractLeadLeakDiagnostic(array $payload, array $meta): ?array
    {
        $submittedSource = strtolower(trim((string) ($payload['source'] ?? $meta['source'] ?? '')));
        if ($submittedSource !== 'lead_leak_detector') {
            return null;
        }

        if (is_array($meta['lead_leak_detector'] ?? null)) {
            return $meta['lead_leak_detector'];
        }

        if (!isset($meta['detector_score']) && !isset($meta['detector_answers'])) {
            return null;
        }

        return [
            'score' => $meta['detector_score'] ?? 0,
            'risk_level' => $meta['detector_risk_level'] ?? null,
            'top_leaks' => $meta['detector_top_leaks'] ?? [],
            'answers' => $meta['detector_answers'] ?? [],
            'cta_type' => $meta['cta_type'] ?? null,
            'source_trigger' => $meta['source_trigger'] ?? null,
        ];
    }

    /**
     * Resolve the selected website item if it belongs to the current tenant.
     *
     * @param array<string, mixed> $meta
     */
    private function resolveWebsiteItemId(int $tenantId, array $meta): ?int
    {
        $itemId = $meta['lead_item_id'] ?? null;
        if (!is_numeric($itemId) || (int) $itemId <= 0) {
            return null;
        }

        return Item::query()
            ->where('tenant_id', $tenantId)
            ->where('id', (int) $itemId)
            ->value('id');
    }

    private function isOriginAllowed(?array $allowedOrigins, bool $allowAllOriginsForTesting, ?string $origin): bool
    {
        if ($allowAllOriginsForTesting) {
            return true;
        }

        $normalizedOrigin = $this->normalizeOrigin($origin);
        $configuredOrigins = array_values(array_filter(array_map(fn ($item) => $this->normalizeOrigin($item), $allowedOrigins ?? [])));

        if (empty($configuredOrigins)) {
            return !app()->environment('production');
        }

        if (!$normalizedOrigin) {
            return false;
        }

        return in_array($normalizedOrigin, $configuredOrigins, true);
    }

    private function normalizeOrigin(?string $origin): ?string
    {
        $origin = trim((string) $origin);
        if ($origin === '') {
            return null;
        }

        $parts = parse_url($origin);
        if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
            return rtrim(strtolower($origin), '/');
        }

        $value = strtolower($parts['scheme']) . '://' . strtolower($parts['host']);
        if (isset($parts['port'])) {
            $value .= ':' . $parts['port'];
        }

        return $value;
    }

    private function logIntake(?int $tenantId, ?int $connectionId, string $status, array $payload, ?string $errorMessage, Request $request, ?int $leadId = null): WebsiteIntakeLog
    {
        return WebsiteIntakeLog::create([
            'tenant_id' => $tenantId,
            'website_connection_id' => $connectionId,
            'status' => $status,
            'payload' => $payload,
            'error_message' => $errorMessage,
            'ip_address' => $request->ip(),
            'origin' => $request->headers->get('Origin'),
            'user_agent' => $request->userAgent(),
            'lead_id' => $leadId,
        ]);
    }

    private function resolveDuplicateRootId(?Lead $lead, ?int $tenantId): ?int
    {
        if (!$lead) {
            return null;
        }

        $seen = [];
        $current = $lead;
        while ($current) {
            $id = (int) $current->id;
            if (isset($seen[$id])) {
                return $id;
            }

            $seen[$id] = true;

            $meta = is_array($current->meta_data ?? null) ? ($current->meta_data ?? []) : [];
            $dupOf = $meta['duplicate_of'] ?? null;
            if (!is_numeric($dupOf) || (int) $dupOf <= 0) {
                return $id;
            }

            $current = Lead::query()
                ->when($tenantId, fn ($query) => $query->where('tenant_id', $tenantId))
                ->find((int) $dupOf);
        }

        return $lead->id;
    }

    private function findActiveDuplicateLead(?int $tenantId, array $phoneVariants, ?int $duplicateOfId): ?Lead
    {
        if (!$duplicateOfId || empty($phoneVariants)) {
            return null;
        }

        $query = Lead::query()->whereIn('phone', $phoneVariants);
        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $query->where(function ($sub) {
            $sub->whereRaw("lower(coalesce(status, '')) = 'duplicate'")
                ->orWhereRaw("lower(coalesce(stage, '')) = 'duplicate'");
        });

        $candidates = $query->get();
        foreach ($candidates as $candidate) {
            $meta = is_array($candidate->meta_data ?? null) ? ($candidate->meta_data ?? []) : [];
            $dupOf = $meta['duplicate_of'] ?? null;
            if (is_numeric($dupOf) && (int) $dupOf === (int) $duplicateOfId) {
                return $candidate;
            }
        }

        return null;
    }

    private function getDuplicateNotificationRecipients(?int $tenantId): array
    {
        if (!$tenantId) {
            return [];
        }

        return User::where('tenant_id', $tenantId)
            ->whereHas('roles', function ($query) {
                $query->whereIn('name', ['Admin', 'Tenant Admin', 'Sales Manager', 'Branch Manager']);
            })
            ->get()
            ->all();
    }

    /**
     * Track duplicate attempts in meta_data (non-breaking).
     *
     * @param array<string, mixed> $meta
     * @param array<string, mixed> $attempt
     * @return array<string, mixed>
     */
    private function bumpDuplicateAttemptMeta(array $meta, array $attempt): array
    {
        $count = (int) ($meta['duplicate_attempts_count'] ?? 0);
        $count++;
        $meta['duplicate_attempts_count'] = $count;
        $meta['last_duplicate_at'] = now()->toDateTimeString();

        $attempts = $meta['duplicate_attempts'] ?? null;
        $attempts = is_array($attempts) ? $attempts : [];
        if (!empty($attempt)) {
            $attempts[] = $attempt;
        }
        if (count($attempts) > 20) {
            $attempts = array_slice($attempts, -20);
        }

        $meta['duplicate_attempts'] = $attempts;

        return $meta;
    }

    /**
     * Build a duplicate attempt record for website intake.
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed> $meta
     * @return array<string, mixed>
     */
    private function buildDuplicateAttemptMeta(array $data, array $meta = []): array
    {
        $metaData = is_array($data['meta_data'] ?? null) ? $data['meta_data'] : [];

        return array_filter([
            'at' => now()->toIso8601String(),
            'context' => 'website_intake',
            'channel' => 'website',
            'form_name' => $metaData['form_name'] ?? null,
            'page_url' => $metaData['page_url'] ?? null,
            'phone' => $meta['phone'] ?? null,
            'duplicate_of' => $meta['duplicate_of'] ?? null,
            'entered_stage' => $meta['stage'] ?? null,
            'source' => $data['source'] ?? null,
        ], fn ($v) => $v !== null && $v !== '');
    }

    /**
     * Handle test connection request.
     * This method creates a real test lead to verify the entire flow works.
     *
     * @param \App\Models\WebsiteConnection $connection
     * @param \Illuminate\Http\Request $request
     * @return array
     */
    public function handleTest(\App\Models\WebsiteConnection $connection, Request $request): array
    {
        if (!$connection->is_active) {
            $this->logIntake((int) $connection->tenant_id, (int) $connection->id, 'inactive_connection', [], 'Website connection is inactive.', $request);
            throw new HttpException(422, 'Website connection is inactive.');
        }

        $payload = $this->buildTestPayload();

        $result = null;

        try {
            $processed = $this->processResolvedConnection($connection, $payload, $request, [
                'dispatch_notifications' => false,
            ]);
            $lead = $processed['lead'];
            $result = $processed['status'];
            $log = $processed['log'];

            return [
                'success' => true,
                'message' => 'Test lead created successfully',
                'lead_id' => $lead->id,
                'log_id' => $log?->id,
                'source' => $processed['source_name'],
                'campaign_id' => $connection->default_campaign_id,
                'status' => $result,
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'message' => $e->getMessage(),
                'status' => 'exception',
            ];
        }
    }

    private function buildTestPayload(): array
    {
        return [
            'name' => 'Website Test Lead',
            'phone' => '01000000000',
            'email' => 'test@example.com',
            'message' => 'This is a test lead from Website Integration',
            'meta' => [
                'form_name' => 'crm_test_connection',
                'page_url' => 'crm://website-integration/test',
                'is_test' => true,
                'submitted_from' => 'crm_test_connection',
            ],
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $options
     * @return array{lead: Lead, status: string, log: WebsiteIntakeLog|null, source_name: string, report_url: string|null, report_path: string|null}
     */
    private function processResolvedConnection($connection, array $payload, Request $request, array $options = []): array
    {
        $dispatchNotifications = $options['dispatch_notifications'] ?? true;
        $tenantId = (int) $connection->tenant_id;
        $sourceName = $this->sourceResolver->resolveSourceNameForConnection($tenantId, $connection->default_source_id);
        $rawPhone = trim((string) ($payload['phone'] ?? ''));
        $leadPayload = $this->buildLeadPayload($connection, $payload, $sourceName, $rawPhone);

        $result = null;
        $boundTenant = app()->bound('current_tenant_id');
        $previousTenantId = $boundTenant ? app('current_tenant_id') : null;

        try {
            app()->instance('current_tenant_id', $tenantId);

            DB::beginTransaction();

            [$lead, $result] = $this->createOrUpdateLead($tenantId, $leadPayload, $rawPhone);

            $connection->forceFill([
                'last_used_at' => now(),
                'requests_count' => (int) $connection->requests_count + 1,
            ])->save();

            $logStatus = in_array($result, ['created_duplicate', 'updated_duplicate'], true) ? 'duplicate' : 'success';
            $log = $this->logIntake($tenantId, (int) $connection->id, $logStatus, $payload, null, $request, (int) $lead->id);

            DB::commit();

            $generatedReportPath = null;
            $generatedReportUrl = null;
            $diagnostic = data_get($leadPayload, 'meta_data.lead_leak_detector');
            if (is_array($diagnostic)) {
                try {
                    $generatedReportPath = $this->leadLeakReportService->generateForLead($lead, $diagnostic);
                    $this->attachLeadLeakDiagnosticSnapshot($lead->fresh(), $diagnostic);
                    $generatedReportUrl = $this->makeAbsoluteStorageUrl($request, $generatedReportPath);
                } catch (\Throwable $reportError) {
                    \Illuminate\Support\Facades\Log::warning('Lead leak report generation failed after lead intake.', [
                        'lead_id' => $lead->id ?? null,
                        'tenant_id' => $tenantId,
                        'message' => $reportError->getMessage(),
                    ]);
                }
            }

            if ($dispatchNotifications) {
                $this->notifyLeadCreated($lead, $result);
            }

            return [
                'lead' => $lead,
                'status' => $result,
                'log' => $log,
                'source_name' => $sourceName,
                'report_path' => $generatedReportPath,
                'report_url' => $generatedReportUrl,
            ];
        } catch (\Throwable $e) {
            DB::rollBack();
            if ($generatedReportPath) {
                Storage::disk('public')->delete($generatedReportPath);
            }
            $this->logIntake($tenantId, (int) $connection->id, 'exception', $payload, $e->getMessage(), $request);
            throw $e;
        } finally {
            if ($boundTenant) {
                app()->instance('current_tenant_id', $previousTenantId);
            } else {
                app()->forgetInstance('current_tenant_id');
            }
        }
    }

    private function buildLeadPayload($connection, array $payload, string $sourceName, string $rawPhone): array
    {
        $tenantId = (int) $connection->tenant_id;
        $phone = PhoneNormalizer::normalize($rawPhone);
        $meta = is_array($payload['meta'] ?? null) ? $payload['meta'] : [];
        $itemId = $this->resolveWebsiteItemId($tenantId, $meta);
        $metaData = $this->buildMetaData($connection, $payload);

        if (($meta['is_test'] ?? false) === true) {
            $metaData['is_test'] = true;
        }

        if (filled($meta['submitted_from'] ?? null)) {
            $metaData['submitted_from'] = trim((string) $meta['submitted_from']);
        }

        return [
            'tenant_id' => $tenantId,
            'name' => trim((string) ($payload['name'] ?? '')),
            'phone' => $phone,
            'email' => filled($payload['email'] ?? null) ? trim((string) $payload['email']) : null,
            'notes' => filled($payload['message'] ?? null) ? trim((string) $payload['message']) : null,
            'source' => $sourceName,
            'campaign_id' => $this->resolveCampaignId($tenantId, $connection->default_campaign_id),
            'website_connection_id' => (int) $connection->id,
            'item_id' => $itemId,
            'workflow_key' => TelesalesService::WORKFLOW_SALES,
            'stage' => 'New Lead',
            'status' => null,
            'created_by' => null,
            'meta_data' => $metaData,
        ];
    }
}
