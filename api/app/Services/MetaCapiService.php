<?php

namespace App\Services;

use App\Contracts\MetaApiClientInterface;
use App\Models\CcCustomer;
use App\Models\Integration;
use App\Models\Lead;
use App\Models\Revenue;
use App\Models\Tenant;
use Illuminate\Support\Facades\Log;

class MetaCapiService
{
    public function __construct(
        protected MetaApiClientInterface $apiClient,
        protected MetaCapiTokenResolver $capiTokenResolver
    ) {
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function sendTestEvent(int|string $tenantId, array $payload): array
    {
        $event = $this->buildEventFromPayload($payload);

        if (config('services.meta.mock_mode')) {
            return [
                'ok' => true,
                'mock' => true,
                'message' => 'CAPI test event accepted in mock mode.',
                'payload' => $payload,
            ];
        }

        $tokenResolution = $this->capiTokenResolver->resolveForTenant($tenantId);
        $pixelId = (string) $payload['pixel_id'];

        $response = $this->apiClient->post("/{$pixelId}/events", [
            'data' => [$event],
            'access_token' => $tokenResolution['token'],
        ]);

        $message = $tokenResolution['source'] === 'pixel'
            ? 'CAPI test event sent using pixel-level access token.'
            : 'CAPI test event sent using app access token. For production, configure a pixel-level token from Events Manager.';

        return [
            'ok' => true,
            'message' => $message,
            'token_source' => $tokenResolution['source'],
            'response' => $response,
        ];
    }

    public function sendLeadEventIfEnabled(int|string $tenantId, Lead $lead, ?Integration $integration = null): ?array
    {
        return $this->sendLifecycleEventIfEnabled(
            tenantId: $tenantId,
            eventKey: 'Lead',
            lead: $lead,
            integration: $integration,
            eventBuilder: fn () => $this->buildLeadEvent($lead),
            logLabel: 'lead'
        );
    }

    public function sendCompleteRegistrationEventIfEnabled(int|string $tenantId, Lead $lead, ?Integration $integration = null): ?array
    {
        return $this->sendLifecycleEventIfEnabled(
            tenantId: $tenantId,
            eventKey: 'CompleteRegistration',
            lead: $lead,
            integration: $integration,
            eventBuilder: fn () => $this->buildCompleteRegistrationEvent($lead),
            logLabel: 'complete_registration'
        );
    }

    public function sendPurchaseEventIfEnabled(int|string $tenantId, Lead $lead, Revenue $revenue, ?Integration $integration = null): ?array
    {
        return $this->sendLifecycleEventIfEnabled(
            tenantId: $tenantId,
            eventKey: 'Purchase',
            lead: $lead,
            integration: $integration,
            eventBuilder: fn () => $this->buildPurchaseEvent($lead, $revenue),
            logLabel: 'purchase'
        );
    }

    /**
     * @param  callable(): array<string, mixed>  $eventBuilder
     */
    protected function sendLifecycleEventIfEnabled(
        int|string $tenantId,
        string $eventKey,
        Lead $lead,
        ?Integration $integration,
        callable $eventBuilder,
        string $logLabel
    ): ?array {
        $settings = $this->resolveSettings($tenantId, $integration);
        if ($settings === null) {
            return null;
        }

        $events = is_array($settings['events'] ?? null) ? $settings['events'] : [];
        if (empty($events[$eventKey])) {
            return null;
        }

        $pixelId = trim((string) ($settings['pixelId'] ?? ''));
        if ($pixelId === '') {
            Log::info("Meta CAPI skipped: pixel ID not configured.", [
                'tenant_id' => $tenantId,
                'lead_id' => $lead->id,
                'event' => $eventKey,
            ]);

            return null;
        }

        try {
            return $this->sendEvent($tenantId, $pixelId, $eventBuilder());
        } catch (\Throwable $e) {
            Log::warning("Meta CAPI {$logLabel} event failed.", [
                'tenant_id' => $tenantId,
                'lead_id' => $lead->id,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    protected function resolveSettings(int|string $tenantId, ?Integration $integration = null): ?array
    {
        $integration = $integration ?? Integration::where('tenant_id', $tenantId)
            ->where('provider', 'meta')
            ->first();

        $settings = is_array($integration?->settings) ? $integration->settings : [];

        if (empty($settings['enableCapi'])) {
            return null;
        }

        return $settings;
    }

    /**
     * @return array<string, mixed>
     */
    public function sendEvent(int|string $tenantId, string $pixelId, array $event): array
    {
        if (config('services.meta.mock_mode')) {
            Log::info('Meta CAPI mock event dispatched.', [
                'tenant_id' => $tenantId,
                'pixel_id' => $pixelId,
                'event_name' => $event['event_name'] ?? null,
                'event_id' => $event['event_id'] ?? null,
            ]);

            return ['mock' => true, 'events_received' => 1];
        }

        $tokenResolution = $this->capiTokenResolver->resolveForTenant($tenantId);

        return $this->apiClient->post("/{$pixelId}/events", [
            'data' => [$event],
            'access_token' => $tokenResolution['token'],
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    protected function buildEventFromPayload(array $payload): array
    {
        return [
            'event_name' => $payload['event_name'],
            'event_time' => $payload['event_time'] ?? time(),
            'action_source' => $payload['action_source'] ?? 'website',
            'event_source_url' => $payload['event_source_url'] ?? config('app.frontend_url'),
            'user_data' => $payload['user_data'] ?? [],
            'custom_data' => $payload['custom_data'] ?? [],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function buildLeadEvent(Lead $lead): array
    {
        $metaData = is_array($lead->meta_data) ? $lead->meta_data : [];
        $eventId = $lead->meta_id
            ? 'meta_lead_' . $lead->meta_id
            : 'crm_lead_' . $lead->id . '_created';

        return [
            'event_name' => 'Lead',
            'event_time' => $lead->created_at?->getTimestamp() ?? time(),
            'action_source' => 'system_generated',
            'event_id' => $eventId,
            'user_data' => $this->hashUserData($lead->email, $lead->phone, $lead->name),
            'custom_data' => array_filter([
                'lead_event_source' => 'crm',
                'content_name' => $metaData['form_name'] ?? null,
            ]),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function buildCompleteRegistrationEvent(Lead $lead): array
    {
        return [
            'event_name' => 'CompleteRegistration',
            'event_time' => time(),
            'action_source' => 'system_generated',
            'event_id' => 'crm_lead_' . $lead->id . '_registered',
            'user_data' => $this->hashUserData($lead->email, $lead->phone, $lead->name),
            'custom_data' => [
                'lead_event_source' => 'crm',
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function buildPurchaseEvent(Lead $lead, Revenue $revenue): array
    {
        $currency = trim((string) ($revenue->currency ?? ''));
        if ($currency === '') {
            $currency = 'EGP';
        }

        $customData = array_filter([
            'value' => (float) $revenue->amount,
            'currency' => $currency,
            'lead_event_source' => 'crm',
            'content_name' => $this->resolvePurchaseContentName($lead, $revenue),
        ], fn ($value) => $value !== null && $value !== '');

        return [
            'event_name' => 'Purchase',
            'event_time' => $revenue->created_at?->getTimestamp() ?? time(),
            'action_source' => 'system_generated',
            'event_id' => 'revenue_' . $revenue->id,
            'user_data' => $this->hashUserData($lead->email, $lead->phone, $lead->name),
            'custom_data' => $customData,
        ];
    }

    protected function resolvePurchaseContentName(Lead $lead, Revenue $revenue): ?string
    {
        $tenant = Tenant::query()->find($revenue->tenant_id ?: $lead->tenant_id);
        if (! $tenant) {
            return null;
        }

        $slugs = app(ModuleService::class)->enabledForTenant($tenant)->pluck('slug');
        if (! $slugs->contains('contract_collections')) {
            return null;
        }

        $ccCustomer = CcCustomer::where('lead_id', $lead->id)->first();
        $contract = $ccCustomer?->contracts()->latest('id')->first();

        $contractNumber = trim((string) ($contract?->contract_number ?? ''));

        return $contractNumber !== '' ? $contractNumber : null;
    }

    /**
     * @return array<string, string>
     */
    protected function hashUserData(?string $email, ?string $phone, ?string $name): array
    {
        $userData = [];

        if (is_string($email) && trim($email) !== '') {
            $userData['em'] = hash('sha256', strtolower(trim($email)));
        }

        if (is_string($phone) && trim($phone) !== '') {
            $normalizedPhone = preg_replace('/\D+/', '', $phone) ?: '';
            if ($normalizedPhone !== '') {
                $userData['ph'] = hash('sha256', $normalizedPhone);
            }
        }

        if (is_string($name) && trim($name) !== '') {
            $parts = preg_split('/\s+/', trim($name), 2);
            if (! empty($parts[0])) {
                $userData['fn'] = hash('sha256', strtolower(trim($parts[0])));
            }
            if (! empty($parts[1])) {
                $userData['ln'] = hash('sha256', strtolower(trim($parts[1])));
            }
        }

        return $userData;
    }
}
