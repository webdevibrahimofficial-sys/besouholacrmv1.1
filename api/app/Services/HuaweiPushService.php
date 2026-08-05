<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class HuaweiPushService
{
    public function sendToTokens(array $tokens, string $title, string $body, array $data = []): array
    {
        $tokens = collect($tokens)
            ->filter(fn ($token) => is_string($token) && trim($token) !== '')
            ->map(fn ($token) => trim($token))
            ->unique()
            ->values()
            ->all();

        if ($tokens === []) {
            return $this->summary(true, 0, 0, 0, []);
        }

        $config = config('services.huawei_push');
        $clientId = $config['client_id'] ?? null;
        $clientSecret = $config['client_secret'] ?? null;

        if (!$clientId || !$clientSecret) {
            Log::warning('Huawei push credentials are not configured.');

            return $this->summary(false, count($tokens), 0, count($tokens), []);
        }

        try {
            $accessToken = $this->getAccessToken($clientId, $clientSecret, $config['oauth_url'] ?? 'https://oauth-login.cloud.huawei.com/oauth2/v3/token');

            $response = Http::timeout(20)
                ->withToken($accessToken)
                ->acceptJson()
                ->post(rtrim((string) ($config['api_base_url'] ?? 'https://push-api.cloud.huawei.com'), '/') . '/v1/' . $clientId . '/messages:send', [
                    'validate_only' => false,
                    'message' => [
                        'token' => $tokens,
                        'android' => [
                            'notification' => [
                                'title' => $title,
                                'body' => $body,
                                'click_action' => [
                                    'type' => 3,
                                ],
                            ],
                        ],
                        'data' => $this->encodeData($data),
                    ],
                ]);

            if ($response->failed()) {
                Log::warning('Huawei push send failed', [
                    'status' => $response->status(),
                    'body' => $response->json() ?? $response->body(),
                    'tokens_count' => count($tokens),
                ]);

                return $this->summary(false, count($tokens), 0, count($tokens), []);
            }

            return $this->summary(true, count($tokens), count($tokens), 0, []);
        } catch (ConnectionException | \Throwable $e) {
            Log::error('Huawei push send exception', [
                'message' => $e->getMessage(),
                'tokens_count' => count($tokens),
            ]);

            return $this->summary(false, count($tokens), 0, count($tokens), []);
        }
    }

    protected function getAccessToken(string $clientId, string $clientSecret, string $oauthUrl): string
    {
        $cacheKey = 'huawei_push_access_token_' . md5($clientId);

        return Cache::remember($cacheKey, now()->addMinutes(50), function () use ($clientId, $clientSecret, $oauthUrl) {
            $response = Http::asForm()
                ->timeout(20)
                ->acceptJson()
                ->post($oauthUrl, [
                    'grant_type' => 'client_credentials',
                    'client_id' => $clientId,
                    'client_secret' => $clientSecret,
                ]);

            if ($response->failed()) {
                throw new \RuntimeException('Unable to obtain Huawei push access token.');
            }

            $accessToken = $response->json('access_token');

            if (!is_string($accessToken) || trim($accessToken) === '') {
                throw new \RuntimeException('Huawei push access token response is invalid.');
            }

            return $accessToken;
        });
    }

    protected function encodeData(array $data): string
    {
        return json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '{}';
    }

    protected function summary(bool $ok, int $total, int $successes, int $failures, array $invalidTokens): array
    {
        return [
            'ok' => $ok,
            'total_tokens' => $total,
            'successes' => $successes,
            'failures' => $failures,
            'invalid_tokens_removed' => count($invalidTokens),
            'invalid_tokens' => $invalidTokens,
        ];
    }
}
