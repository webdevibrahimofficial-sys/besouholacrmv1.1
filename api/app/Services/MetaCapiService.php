<?php

namespace App\Services;

use App\Contracts\MetaApiClientInterface;
use App\Models\Integration;
use App\Models\Lead;
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
        if (!$lead->wasRecentlyCreated) {
            return null;
        }

        $integration = $integration ?? Integration::where('tenant_id', $tenantId)
            ->where('provider', 'meta')
            ->first();
        $settings = is_array($integration?->settings) ? $integration->settings : [];

        if (empty($settings['enableCapi'])) {
            return null;
        }

        $pixelId = trim((string) ($settings['pixelId'] ?? ''));
        if ($pixelId === '') {
            Log::info('Meta CAPI skipped: pixel ID not configured.', ['tenant_id' => $tenantId, 'lead_id' => $lead->id]);
            return null;
        }

        $events = is_array($settings['events'] ?? null) ? $settings['events'] : [];
        if (empty($events['Lead'])) {
            return null;
        }

        try {
            return $this->sendEvent($tenantId, $pixelId, $this->buildLeadEvent($lead));
        } catch (\Throwable $e) {
            Log::warning('Meta CAPI lead event failed.', [
                'tenant_id' => $tenantId,
                'lead_id' => $lead->id,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
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
        $eventId = $lead->meta_id ? 'meta_lead_' . $lead->meta_id : 'crm_lead_' . $lead->id;

        $event = [
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

        return $event;
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
            if (!empty($parts[0])) {
                $userData['fn'] = hash('sha256', strtolower(trim($parts[0])));
            }
            if (!empty($parts[1])) {
                $userData['ln'] = hash('sha256', strtolower(trim($parts[1])));
            }
        }

        return $userData;
    }
}
