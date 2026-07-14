<?php

namespace App\Services;

use App\Contracts\MetaApiClientInterface;
use App\Models\Lead;
use App\Models\Integration;
use App\Models\MetaPage;
use App\Models\Campaign;
use App\Models\Source;
use Illuminate\Support\Facades\Log;
use App\Notifications\MetaConnectionLostNotification;

class MetaLeadService
{
    protected $apiClient;
    protected $accessTokenService;

    public function __construct(
        MetaApiClientInterface $apiClient,
        MetaAccessTokenService $accessTokenService,
        protected TenantAdminResolver $tenantAdmins
    ) {
        $this->apiClient = $apiClient;
        $this->accessTokenService = $accessTokenService;
    }

    protected function resolveLeadSource(array $data): string
    {
        return 'Meta Ads';
    }

    public function processLead($tenantId, $leadId, $pageId = null, $accessToken = null)
    {
        $integration = Integration::where('tenant_id', $tenantId)->where('provider', 'meta')->first();
        $tokenSource = $accessToken ? 'explicit' : null;

        if ($this->isPostmanTestLeadId($leadId)) {
            Log::info('Processing synthetic Postman Meta lead', [
                'tenant_id' => $tenantId,
                'lead_id' => $leadId,
                'page_id' => $pageId,
            ]);

            $this->storeLead($tenantId, $this->buildPostmanTestLeadPayload($leadId, $pageId), $integration);
            return;
        }
        
        if (!$accessToken) {
            // Try to find token via Page ID
            if ($pageId) {
                $page = MetaPage::with('connection')->where('tenant_id', $tenantId)->where('page_id', $pageId)->first();
                if ($page) {
                    $accessToken = $page->page_token;
                    $tokenSource = $accessToken ? 'page_token' : null;
                    // Fallback to User Token if Page Token is missing
                    if (!$accessToken && $page->connection) {
                        $accessToken = $page->connection->user_access_token;
                        $tokenSource = $accessToken ? 'page_connection_user_token' : null;
                    }
                }
            }

            // Fallback: Find any valid connection if no specific page context or token found yet
            if (!$accessToken) {
                $accessToken = $this->accessTokenService->getTenantAccessToken($tenantId);
                $tokenSource = $accessToken ? 'fallback_user_token' : null;
            }

            if (!$accessToken) {
                // Check if Mock Mode is enabled and allow bypass with a dummy token
                if (config('services.meta.mock_mode')) {
                    $accessToken = 'mock_access_token_bypass';
                    $tokenSource = 'mock_mode';
                    Log::info("Mock Mode: Using dummy access token for lead processing (Tenant: {$tenantId}, Lead: {$leadId})");
                } else {
                    Log::error("No valid Meta access token found for tenant {$tenantId} while processing lead {$leadId}");
                    return;
                }
            }
        }

        // Fetch lead details from Graph API
        try {
            Log::info('Meta Lead Fetch', [
                'tenant_id' => $tenantId,
                'lead_id' => $leadId,
                'page_id' => $pageId,
                'token_source' => $tokenSource,
                'token_prefix' => $accessToken ? substr($accessToken, 0, 15) : null,
            ]);

            $data = $this->apiClient->get("/{$leadId}", [
                'access_token' => $accessToken,
                'fields' => 'id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,form_name,field_data',
            ]);

            if ($pageId && empty($data['page_id'])) {
                $data['page_id'] = (string) $pageId;
            }

            $this->storeLead($tenantId, $data, $integration);

        } catch (\Exception $e) {
            $message = $e->getMessage();
            $code = $e->getCode();

            // Check for Token Expiration (190) or Session Expiration (102)
            if (in_array($code, [190, 102]) || ($code == 10 && str_contains(strtolower($message), 'permission'))) {
                Log::warning("Meta Token Expired/Invalid for Tenant {$tenantId}: {$message}");
                $this->notifyTenantAdmin($tenantId, $message);
            } elseif (in_array($code, [1, 2, 4, 17, 341, 368]) || $code >= 500) {
                Log::warning("Meta API Temporary Failure (Code: {$code}) for Tenant {$tenantId}: {$message}. Retrying...");
                throw $e; // Re-throw to trigger job retry
            } else {
                Log::error("Failed to fetch lead {$leadId}: " . $message);
            }
        }
    }

    protected function storeLead($tenantId, $data, $integration = null)
    {
        if (!$integration) {
            $integration = Integration::where('tenant_id', $tenantId)->where('provider', 'meta')->first();
        }

        $this->ensureMetaSourceExists($tenantId);

        // Parse field_data to get name, email, phone
        // Meta returns field_data as an array of objects: [{name: "email", values: ["..."]}, ...]
        $fields = collect($data['field_data'] ?? [])->mapWithKeys(function ($item) {
            return [$item['name'] => $item['values'][0] ?? null];
        });

        // Use custom field mapping if available in integration settings.
        // Priority:
        // 1) Per-form mapping: settings.formMap[form_id]
        // 2) Global mapping: settings.fieldMap
        $settingsArr = ($integration && is_array($integration->settings)) ? $integration->settings : [];
        $formId = $data['form_id'] ?? null;

        $map = [];
        if ($formId && isset($settingsArr['formMap']) && is_array($settingsArr['formMap'])) {
            $perForm = $settingsArr['formMap'][(string)$formId] ?? null;
            if (is_array($perForm)) {
                // Allow storing mapping directly OR nested under fieldMap
                if (isset($perForm['fieldMap']) && is_array($perForm['fieldMap'])) {
                    $map = $perForm['fieldMap'];
                } else {
                    $map = $perForm;
                }
            }
        }
        if (empty($map) && isset($settingsArr['fieldMap']) && is_array($settingsArr['fieldMap'])) {
            $map = $settingsArr['fieldMap'];
        }


        // Normalize map to be CRM_FIELD => META_FIELD
        // The frontend (MetaSettings.jsx) seems to save as { "META_FIELD": "CRM_FIELD" }
        // We want to easily look up "What is the Meta field for 'email'?"
        $crmToMetaMap = [];
        foreach ($map as $key => $value) {
            // If key is Meta field and value is CRM field
            $crmToMetaMap[$value] = $key;
        }
        // Merge with original map just in case it was already in correct format, giving precedence to the flipped one if valid
        // or just rely on $crmToMetaMap for the standard fields lookups

        // Helper to find value by mapped key or fallback
        $getValue = function ($crmKey, $fallbacks) use ($fields, $crmToMetaMap, $map) {
            // Check mapped key in crmToMetaMap
            if (isset($crmToMetaMap[$crmKey]) && isset($fields[$crmToMetaMap[$crmKey]])) {
                return $fields[$crmToMetaMap[$crmKey]];
            }
            // Check direct map (if map was CRM=>Meta)
            if (isset($map[$crmKey]) && isset($fields[$map[$crmKey]])) {
                return $fields[$map[$crmKey]];
            }
            // Check fallbacks
            foreach ($fallbacks as $fb) {
                if (isset($fields[$fb])) return $fields[$fb];
            }
            return null;
        };

        $name = $getValue('name', ['full_name', 'name']);
        $email = $getValue('email', ['email', 'work_email']);
        $phone = $getValue('phone', ['phone_number', 'phone']);
        
        // Handle Custom Mapped Fields (Generic)
        // Iterate over all available fields from Meta and check if they are mapped to any other CRM column
        $additionalAttributes = [];
        $unmappedFields = [];
        
        foreach ($fields as $metaKey => $value) {
            // Check if this Meta Key is mapped to a CRM Field in the settings
            // Map structure from frontend: { "META_KEY": "CRM_KEY" }
            if (isset($map[$metaKey])) {
                $crmKey = $map[$metaKey];
                // Skip standard fields we already handled
                if (in_array($crmKey, ['name', 'email', 'phone'])) continue;
                
                if (!empty($value)) {
                    // For 'notes', we might want to append if multiple fields map to it
                    if ($crmKey === 'notes') {
                        $additionalAttributes['notes'] = ($additionalAttributes['notes'] ?? '') . "{$metaKey}: {$value}\n";
                    } else {
                        $additionalAttributes[$crmKey] = $value;
                    }
                }
            } else {
                // If not mapped, keep track of it for the JSON column
                if (!in_array($metaKey, ['full_name', 'name', 'email', 'work_email', 'phone_number', 'phone'])) {
                    $unmappedFields[$metaKey] = $value;
                }
            }
        }
        
        // Find or create campaign locally
        $campaignId = null;
        if (isset($data['campaign_id'])) {
            $campaign = Campaign::firstOrCreate(
                ['meta_id' => $data['campaign_id'], 'tenant_id' => $tenantId],
                [
                    'name' => $data['campaign_name'] ?? 'Unknown Campaign', 
                    'source' => 'meta', 
                    'provider' => 'meta',
                    'status' => 'ACTIVE', // Default status
                    'start_date' => now(),
                ]
            );
            $campaignId = $campaign->id;
        }

        $resolvedSource = $this->resolveLeadSource($data);
        $pageContext = $this->resolvePageContext($tenantId, $data);
        $agencyName = $this->resolveAgencyName($data, $pageContext);

        $leadData = array_merge([
            'name' => $name,
            'email' => $email,
            'phone' => $phone,
            'stage' => 'New Lead',
            'source' => $resolvedSource,
            'platform' => 'facebook',
            'is_organic' => false,
            'campaign_id' => $campaignId,
            'campaign_id_meta' => $data['campaign_id'] ?? null,
            'adset_id' => $data['adset_id'] ?? null,
            'adset_name' => $data['adset_name'] ?? null,
            'ad_id' => $data['ad_id'] ?? null,
            'ad_name' => $data['ad_name'] ?? null,
            'form_id' => $data['form_id'] ?? null,
            'meta_data' => [
                'provider' => 'meta',
                'agency_id' => $pageContext['agency_id'] ?? null,
                'agency' => $agencyName,
                'source' => $resolvedSource,
                'page_id' => $pageContext['page_id'] ?? ($data['page_id'] ?? null),
                'page_name' => $pageContext['page_name'] ?? ($data['page_name'] ?? null),
                'form_id' => $data['form_id'] ?? null, 
                'form_name' => $data['form_name'] ?? null,
                'campaign_id' => $data['campaign_id'] ?? null,
                'campaign_name' => $data['campaign_name'] ?? null,
                'adset_id' => $data['adset_id'] ?? null,
                'adset_name' => $data['adset_name'] ?? null,
                'ad_id' => $data['ad_id'] ?? null,
                'ad_name' => $data['ad_name'] ?? null,
                'fields' => $fields->toArray(),
                'custom_questions' => $unmappedFields, // Explicitly store unmapped fields here
                'raw_payload' => $data
            ],
            'created_at' => isset($data['created_time']) ? \Carbon\Carbon::parse($data['created_time']) : now(),
        ], $additionalAttributes);

        $lead = Lead::updateOrCreate(
            [
                'meta_id' => $data['id'],
                'tenant_id' => $tenantId,
            ],
            $leadData
        );

        // CAPI Lead events are dispatched once via LeadObserver::created.
    }

    protected function ensureMetaSourceExists(int $tenantId): void
    {
        Source::firstOrCreate(
            ['tenant_id' => $tenantId, 'name' => 'Meta Ads'],
            ['is_active' => true]
        );
    }

    protected function resolvePageContext(int $tenantId, array $data): array
    {
        $pageId = trim((string) ($data['page_id'] ?? ''));
        $pageName = trim((string) ($data['page_name'] ?? ''));

        if ($pageId === '') {
            return [
                'page_id' => null,
                'page_name' => $pageName !== '' ? $pageName : null,
                'agency_id' => null,
            ];
        }

        $page = MetaPage::query()
            ->where('tenant_id', $tenantId)
            ->where('page_id', $pageId)
            ->first();

        return [
            'page_id' => $pageId,
            'page_name' => $page?->page_name ?: ($pageName !== '' ? $pageName : null),
            'agency_id' => $page?->agency_id,
        ];
    }

    protected function resolveAgencyName(array $data, array $pageContext): ?string
    {
        $candidates = [
            $data['agency'] ?? null,
            data_get($data, 'meta_data.agency'),
            $pageContext['page_name'] ?? null,
            $data['page_name'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            $value = trim((string) ($candidate ?? ''));
            if ($value !== '') {
                return $value;
            }
        }

        return null;
    }

    protected function notifyTenantAdmin($tenantId, $reason)
    {
        $admins = $this->tenantAdmins->resolveForTenant($tenantId);

        foreach ($admins as $admin) {
            try {
                $admin->notify(new MetaConnectionLostNotification($reason));
            } catch (\Exception $e) {
                Log::error("Failed to send Meta notification to user {$admin->id}: " . $e->getMessage());
            }
        }
    }

    protected function isPostmanTestLeadId($leadId): bool
    {
        return str_starts_with(strtolower(trim((string) $leadId)), 'postman-test-');
    }

    protected function buildPostmanTestLeadPayload($leadId, $pageId = null): array
    {
        $suffix = preg_replace('/[^a-z0-9]+/i', '-', strtolower((string) $leadId));

        return [
            'id' => (string) $leadId,
            'created_time' => now()->toIso8601String(),
            'campaign_id' => null,
            'campaign_name' => 'Postman Test Campaign',
            'ad_id' => null,
            'ad_name' => 'Postman Test Ad',
            'adset_id' => null,
            'adset_name' => 'Postman Test Ad Set',
            'form_id' => 'postman-test-form',
            'form_name' => 'Postman Test Form',
            'field_data' => [
                ['name' => 'full_name', 'values' => ['Postman Test Lead']],
                ['name' => 'email', 'values' => ["{$suffix}@postman.test"]],
                ['name' => 'phone_number', 'values' => ['+201000000000']],
            ],
            'page_id' => $pageId,
        ];
    }
}
