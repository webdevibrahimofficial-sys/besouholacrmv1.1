<?php

namespace App\Services\Meta;

use App\Contracts\MetaApiClientInterface;
use App\Services\AdminEventNotificationService;
use App\Services\MetaCredentialsResolver;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\Response;

class RealMetaApiClient implements MetaApiClientInterface
{
    protected $baseUrl = 'https://graph.facebook.com/v19.0';
    protected $credentialsResolver;

    public function __construct(
        ?MetaCredentialsResolver $credentialsResolver = null,
        protected ?AdminEventNotificationService $adminEventNotifications = null
    ) {
        $this->credentialsResolver = $credentialsResolver ?? app(MetaCredentialsResolver::class);
        $this->adminEventNotifications = $adminEventNotifications ?? app(AdminEventNotificationService::class);
    }

    protected function resolveAppSecret(): ?string
    {
        $credentials = $this->credentialsResolver->resolveShared();
        return $credentials['app_secret'] ?? null;
    }

    public function get(string $endpoint, array $params = []): array
    {
        $url = $this->buildUrl($endpoint);
        
        // Add appsecret_proof if access_token is present
        $appSecret = $this->resolveAppSecret();
        if (isset($params['access_token']) && $appSecret) {
            $params['appsecret_proof'] = hash_hmac('sha256', $params['access_token'], $appSecret);
        }

        /** @var Response $response */
        $response = Http::timeout(30)
            ->retry(3, 1000)
            ->get($url, $params);

        if ($response->failed()) {
            $this->handleError($response, $endpoint);
        }

        return $response->json();
    }

    public function post(string $endpoint, array $data = []): array
    {
        $url = $this->buildUrl($endpoint);

        // Add appsecret_proof if access_token is present
        $appSecret = $this->resolveAppSecret();
        if (isset($data['access_token']) && $appSecret) {
            $data['appsecret_proof'] = hash_hmac('sha256', $data['access_token'], $appSecret);
        }
        
        /** @var Response $response */
        $response = Http::timeout(30)
            ->retry(2, 2000)
            ->post($url, $data);

        if ($response->failed()) {
            $this->handleError($response, $endpoint);
        }

        return $response->json();
    }

    protected function buildUrl(string $endpoint): string
    {
        if (str_starts_with($endpoint, 'http')) {
            return $endpoint;
        }
        
        $endpoint = ltrim($endpoint, '/');
        
        return "{$this->baseUrl}/{$endpoint}";
    }

    protected function handleError(Response $response, $endpoint)
    {
        $data = $response->json();
        $error = $data['error'] ?? [];
        
        $message = $error['message'] ?? 'Unknown error';
        $code = $error['code'] ?? $response->status();
        $subcode = $error['error_subcode'] ?? null;
        $userTitle = $error['error_user_title'] ?? null;
        $userMsg = $error['error_user_msg'] ?? null;

        $logMsg = "Meta API Error [{$endpoint}]: {$message} (Code: {$code})";
        if ($subcode) $logMsg .= " (Subcode: {$subcode})";
        if ($userMsg) $logMsg .= " UserMsg: {$userMsg}";

        Log::error($logMsg, [
            'endpoint' => $endpoint,
            'code' => $code,
            'subcode' => $subcode,
            'rate_limited' => in_array((int) $code, [4, 17, 32, 613], true),
        ]);

        // Check for Rate Limit specifically
        if (in_array((int) $code, [4, 17, 32, 613], true)) {
            $counter = (int) Cache::get('meta:rate_limit_events_24h', 0);
            Cache::put('meta:rate_limit_events_24h', $counter + 1, now()->addDay());

            $this->adminEventNotifications->safe(fn () => $this->adminEventNotifications->notifyMetaRateLimit(
                $endpoint,
                (int) $code,
                (string) ($userMsg ?? $message)
            ));

            throw new \Exception("Meta Rate Limit Reached: " . ($userMsg ?? $message));
        }

        throw new \Exception("Meta API Error: " . ($userMsg ?? $message) . " (Code: {$code})");
    }
}
