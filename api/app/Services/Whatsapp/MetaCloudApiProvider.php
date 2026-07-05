<?php

namespace App\Services\Whatsapp;

use App\Contracts\WhatsappProviderInterface;
use App\Events\InboundWhatsappMessage;
use App\Models\WhatsappMessage;
use App\Models\WhatsappSetting;
use App\Support\LeadPhoneMatcher;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class MetaCloudApiProvider implements WhatsappProviderInterface
{
    public function sendTemplate(int $tenantId, string $to, string $template, string $language = 'en_US', array $variables = []): array
    {
        $settings = WhatsappSetting::where('tenant_id', $tenantId)->first();
        if (!$settings) {
            throw ValidationException::withMessages([
                'whatsapp' => ['الرجاء إعداد تكامل WhatsApp أولاً'],
            ]);
        }
        [$token, $phoneId] = $this->resolveCredentials($settings);
        if (!$token || !$phoneId) {
            throw ValidationException::withMessages([
                'whatsapp' => ['الرجاء إعداد phone_number_id و access token قبل الإرسال'],
            ]);
        }
        $payload = [
            'messaging_product' => 'whatsapp',
            'to' => $to,
            'type' => 'template',
            'template' => [
                'name' => $template,
                'language' => ['code' => $language],
            ],
        ];
        $templateComponents = $this->buildTemplateComponents($variables);
        if (!empty($templateComponents)) {
            $payload['template']['components'] = $templateComponents;
        }
        $response = $this->sendRequest($token, $phoneId, $payload);
        if (!$response->successful()) {
            Log::error('WhatsApp template send failed', [
                'status' => $response->status(),
                'response' => $response->json(),
            ]);
        }
        $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $to);
        $message = WhatsappMessage::create($this->buildMessageAttributes([
            'tenant_id' => $tenantId,
            'provider' => 'meta',
            'phone_number_id' => $phoneId,
            'from' => null,
            'to' => $to,
            'type' => 'template',
            'status' => $response->successful() ? 'accepted' : 'failed',
            'direction' => 'outbound',
            'message_id' => data_get($response->json(), 'messages.0.id'),
            'body' => null,
            'raw' => ['request' => $payload, 'response' => $response->json()],
        ], $lead?->id));

        if (
            $lead?->id
            && Schema::hasColumn('whatsapp_messages', 'lead_id')
            && (int) ($message->lead_id ?? 0) !== (int) $lead->id
        ) {
            $message->forceFill(['lead_id' => $lead->id])->save();
            $message->refresh();
        }

        event(new InboundWhatsappMessage($tenantId, [
            'id' => $message->id,
            'lead_id' => $message->lead_id,
            'message_id' => $message->message_id,
            'body' => $message->body,
            'from' => $message->from,
            'to' => $message->to,
            'direction' => $message->direction,
            'status' => $message->status,
            'type' => $message->type,
            'timestamp' => $message->created_at?->toISOString(),
        ]));

        return [
            'ok' => $response->successful(),
            'message_id' => $message->message_id,
            'db_id' => $message->id,
            'request' => $payload,
            'response' => $response->json(),
            'status' => $response->status(),
            'phone_number_id' => $phoneId,
        ];
    }

    public function sendText(int $tenantId, string $to, string $body): array
    {
        $settings = WhatsappSetting::where('tenant_id', $tenantId)->first();
        if (!$settings) {
            throw ValidationException::withMessages([
                'whatsapp' => ['الرجاء إعداد تكامل WhatsApp أولاً'],
            ]);
        }
        [$token, $phoneId] = $this->resolveCredentials($settings);
        if (!$token || !$phoneId) {
            throw ValidationException::withMessages([
                'whatsapp' => ['الرجاء إعداد phone_number_id و access token قبل الإرسال'],
            ]);
        }
        $payload = [
            'messaging_product' => 'whatsapp',
            'to' => $to,
            'type' => 'text',
            'text' => ['body' => $body],
        ];
        $response = $this->sendRequest($token, $phoneId, $payload);
        if (!$response->successful()) {
            Log::error('WhatsApp text send failed', [
                'status' => $response->status(),
                'response' => $response->json(),
            ]);
        }
        $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $to);
        $message = WhatsappMessage::create($this->buildMessageAttributes([
            'tenant_id' => $tenantId,
            'provider' => 'meta',
            'phone_number_id' => $phoneId,
            'from' => null,
            'to' => $to,
            'type' => 'text',
            'status' => $response->successful() ? 'accepted' : 'failed',
            'direction' => 'outbound',
            'message_id' => data_get($response->json(), 'messages.0.id'),
            'body' => $body,
            'raw' => ['request' => $payload, 'response' => $response->json()],
        ], $lead?->id));

        if (
            $lead?->id
            && Schema::hasColumn('whatsapp_messages', 'lead_id')
            && (int) ($message->lead_id ?? 0) !== (int) $lead->id
        ) {
            $message->forceFill(['lead_id' => $lead->id])->save();
            $message->refresh();
        }

        event(new InboundWhatsappMessage($tenantId, [
            'id' => $message->id,
            'lead_id' => $message->lead_id,
            'message_id' => $message->message_id,
            'body' => $message->body,
            'from' => $message->from,
            'to' => $message->to,
            'direction' => $message->direction,
            'status' => $message->status,
            'type' => $message->type,
            'timestamp' => $message->created_at?->toISOString(),
        ]));

        return [
            'ok' => $response->successful(),
            'message_id' => $message->message_id,
            'db_id' => $message->id,
            'request' => $payload,
            'response' => $response->json(),
            'status' => $response->status(),
            'phone_number_id' => $phoneId,
        ];
    }

    public function sendMedia(
        int $tenantId,
        string $to,
        string $mediaType,
        string $mediaUrl,
        ?string $caption = null,
        ?string $filename = null
    ): array {
        $settings = WhatsappSetting::where('tenant_id', $tenantId)->first();
        if (!$settings) {
            throw ValidationException::withMessages([
                'whatsapp' => ['Please configure WhatsApp integration first.'],
            ]);
        }

        [$token, $phoneId] = $this->resolveCredentials($settings);
        if (!$token || !$phoneId) {
            throw ValidationException::withMessages([
                'whatsapp' => ['Phone Number ID and access token are required before sending media.'],
            ]);
        }

        $payload = [
            'messaging_product' => 'whatsapp',
            'to' => $to,
            'type' => $mediaType,
            $mediaType => [
                'link' => $mediaUrl,
            ],
        ];

        if (in_array($mediaType, ['image', 'video', 'document'], true) && $caption) {
            $payload[$mediaType]['caption'] = $caption;
        }

        if ($mediaType === 'document' && $filename) {
            $payload[$mediaType]['filename'] = $filename;
        }

        $response = $this->sendRequest($token, $phoneId, $payload);
        if (!$response->successful()) {
            Log::error('WhatsApp media send failed', [
                'status' => $response->status(),
                'response' => $response->json(),
                'media_type' => $mediaType,
            ]);
        }

        $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $to);
        $message = WhatsappMessage::create($this->buildMessageAttributes([
            'tenant_id' => $tenantId,
            'provider' => 'meta',
            'phone_number_id' => $phoneId,
            'from' => null,
            'to' => $to,
            'type' => $mediaType,
            'status' => $response->successful() ? 'accepted' : 'failed',
            'direction' => 'outbound',
            'message_id' => data_get($response->json(), 'messages.0.id'),
            'body' => $caption,
            'raw' => ['request' => $payload, 'response' => $response->json()],
        ], $lead?->id));

        if (
            $lead?->id
            && Schema::hasColumn('whatsapp_messages', 'lead_id')
            && (int) ($message->lead_id ?? 0) !== (int) $lead->id
        ) {
            $message->forceFill(['lead_id' => $lead->id])->save();
            $message->refresh();
        }

        event(new InboundWhatsappMessage($tenantId, [
            'id' => $message->id,
            'lead_id' => $message->lead_id,
            'message_id' => $message->message_id,
            'body' => $message->body,
            'from' => $message->from,
            'to' => $message->to,
            'direction' => $message->direction,
            'status' => $message->status,
            'type' => $message->type,
            'timestamp' => $message->created_at?->toISOString(),
        ]));

        return [
            'ok' => $response->successful(),
            'message_id' => $message->message_id,
            'db_id' => $message->id,
            'request' => $payload,
            'response' => $response->json(),
            'status' => $response->status(),
            'phone_number_id' => $phoneId,
        ];
    }

    public function testConnection(int $tenantId, array $credentials = []): array
    {
        $settings = WhatsappSetting::where('tenant_id', $tenantId)->first();
        if (!$settings) {
            throw ValidationException::withMessages([
                'whatsapp' => ['Please configure WhatsApp integration first.'],
            ]);
        }

        $token = trim((string) ($credentials['api_key'] ?? $settings->api_key ?? ''));
        $phoneId = trim((string) ($credentials['phone_number_id'] ?? $settings->phone_number_id ?? $settings->api_secret ?? ''));

        if ($token === '' || $phoneId === '') {
            throw ValidationException::withMessages([
                'whatsapp' => ['Phone Number ID and access token are required before testing the connection.'],
            ]);
        }

        $response = $this->sendGraphGetRequest($token, $phoneId, [
            'fields' => 'id,display_phone_number,verified_name,quality_rating',
        ]);

        if (!$response->successful()) {
            Log::error('WhatsApp connection test failed', [
                'status' => $response->status(),
                'response' => $response->json(),
            ]);
        }

        return [
            'ok' => $response->successful(),
            'status' => $response->status(),
            'response' => $response->json(),
            'phone_number_id' => $phoneId,
        ];
    }

    private function resolveCredentials(WhatsappSetting $settings): array
    {
        $token = trim((string) ($settings->api_key ?? ''));
        $phoneId = trim((string) ($settings->phone_number_id ?: $settings->api_secret ?: ''));

        return [$token, $phoneId];
    }

    private function buildTemplateComponents(array $variables): array
    {
        $parameters = collect($variables)
            ->values()
            ->map(fn ($value) => ['type' => 'text', 'text' => (string) $value])
            ->filter(fn ($item) => trim($item['text']) !== '')
            ->values()
            ->all();

        if (empty($parameters)) {
            return [];
        }

        return [[
            'type' => 'body',
            'parameters' => $parameters,
        ]];
    }

    private function buildMessageAttributes(array $attributes, ?int $leadId): array
    {
        if (Schema::hasColumn('whatsapp_messages', 'lead_id')) {
            $attributes['lead_id'] = $leadId;
        }

        return $attributes;
    }

    /**
     * @return \Illuminate\Http\Client\Response|\GuzzleHttp\Promise\PromiseInterface
     */
    private function sendRequest(string $token, string $phoneId, array $payload)
    {
        $url = "https://graph.facebook.com/v18.0/{$phoneId}/messages";
        $http = Http::withToken($token);
        if (app()->environment('local')) {
            $http = $http->withOptions(['verify' => false]);
        }

        return $http->post($url, $payload);
    }

    private function sendGraphGetRequest(string $token, string $phoneId, array $query = []): Response
    {
        $url = "https://graph.facebook.com/v18.0/{$phoneId}";
        $http = Http::withToken($token);
        if (app()->environment('local')) {
            $http = $http->withOptions(['verify' => false]);
        }

        return $http->get($url, $query);
    }

    public function downloadMedia(int $tenantId, string $mediaId): array
    {
        $settings = WhatsappSetting::where('tenant_id', $tenantId)->first();
        if (!$settings) {
            throw ValidationException::withMessages([
                'whatsapp' => ['Please configure WhatsApp integration first.'],
            ]);
        }

        [$token] = $this->resolveCredentials($settings);
        if (!$token) {
            throw ValidationException::withMessages([
                'whatsapp' => ['Access token is required before loading media.'],
            ]);
        }

        $metaResponse = $this->sendGraphGetRequest($token, $mediaId);
        if (!$metaResponse->successful()) {
            throw ValidationException::withMessages([
                'whatsapp' => ['Unable to load media metadata from Meta Cloud API.'],
            ]);
        }

        $downloadUrl = (string) data_get($metaResponse->json(), 'url', '');
        if ($downloadUrl === '') {
            throw ValidationException::withMessages([
                'whatsapp' => ['Meta media download URL is missing.'],
            ]);
        }

        $http = Http::withToken($token);
        if (app()->environment('local')) {
            $http = $http->withOptions(['verify' => false]);
        }

        $fileResponse = $http->get($downloadUrl);
        if (!$fileResponse->successful()) {
            throw ValidationException::withMessages([
                'whatsapp' => ['Unable to download media from Meta Cloud API.'],
            ]);
        }

        return [
            'body' => $fileResponse->body(),
            'mime_type' => data_get($metaResponse->json(), 'mime_type') ?: $fileResponse->header('Content-Type'),
            'filename' => data_get($metaResponse->json(), 'filename'),
        ];
    }
}
