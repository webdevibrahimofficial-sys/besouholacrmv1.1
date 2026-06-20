<?php

namespace App\Services\Whatsapp;

use App\Contracts\WhatsappProviderInterface;
use App\Models\WhatsappMessage;
use App\Models\WhatsappSetting;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
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
        WhatsappMessage::create([
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
        ]);

        return [
            'ok' => $response->successful(),
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
        WhatsappMessage::create([
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
        ]);

        return [
            'ok' => $response->successful(),
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
}
