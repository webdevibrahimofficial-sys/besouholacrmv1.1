<?php

namespace App\Services;

use App\Models\DeviceToken;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Kreait\Firebase\Contract\Messaging;
use Kreait\Firebase\Exception\FirebaseException;
use Kreait\Firebase\Exception\MessagingException;
use Kreait\Firebase\Messaging\CloudMessage;
use Kreait\Firebase\Messaging\Notification;

class FcmService
{
    public function __construct(
        protected Messaging $messaging,
        protected HuaweiPushService $huaweiPushService
    ) {
    }

    public function sendToUser(User $user, string $title, string $body, array $data = []): array
    {
        $tokens = DeviceToken::withoutGlobalScopes()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->get(['token', 'platform', 'push_provider']);

        return $this->sendToDeviceTokens($tokens, $title, $body, $data);
    }

    public function sendToUsers($users, string $title, string $body, array $data = []): array
    {
        $users = $users instanceof Collection ? $users : collect($users);

        $tokens = DeviceToken::withoutGlobalScopes()
            ->whereIn('user_id', $users->pluck('id')->filter()->unique()->values())
            ->whereIn('tenant_id', $users->pluck('tenant_id')->filter()->unique()->values())
            ->get(['token', 'platform', 'push_provider']);

        return $this->sendToDeviceTokens($tokens, $title, $body, $data);
    }

    protected function sendToDeviceTokens(Collection $deviceTokens, string $title, string $body, array $data = []): array
    {
        $normalizedTokens = $deviceTokens
            ->filter(fn ($deviceToken) => is_string($deviceToken->token ?? null) && trim((string) $deviceToken->token) !== '')
            ->unique(fn ($deviceToken) => trim((string) $deviceToken->token))
            ->values();

        if ($normalizedTokens->isEmpty()) {
            return $this->summary(true, 0, 0, 0, [], []);
        }

        $fcmTokens = $normalizedTokens
            ->filter(fn ($deviceToken) => $this->shouldSendViaFcm($deviceToken->platform ?? null, $deviceToken->push_provider ?? null))
            ->pluck('token')
            ->map(fn ($token) => trim((string) $token))
            ->values()
            ->all();

        $hmsTokens = $normalizedTokens
            ->reject(fn ($deviceToken) => $this->shouldSendViaFcm($deviceToken->platform ?? null, $deviceToken->push_provider ?? null))
            ->pluck('token')
            ->map(fn ($token) => trim((string) $token))
            ->values()
            ->all();

        $fcmResult = $this->sendToFcmTokens($fcmTokens, $title, $body, $data);
        $hmsResult = $this->huaweiPushService->sendToTokens($hmsTokens, $title, $body, $data);

        $invalidTokens = array_values(array_unique(array_merge(
            $fcmResult['invalid_tokens'] ?? [],
            $hmsResult['invalid_tokens'] ?? [],
        )));

        return $this->summary(
            ($fcmResult['ok'] ?? true) && ($hmsResult['ok'] ?? true),
            (int) ($fcmResult['total_tokens'] ?? 0) + (int) ($hmsResult['total_tokens'] ?? 0),
            (int) ($fcmResult['successes'] ?? 0) + (int) ($hmsResult['successes'] ?? 0),
            (int) ($fcmResult['failures'] ?? 0) + (int) ($hmsResult['failures'] ?? 0),
            $invalidTokens,
            [
                'fcm' => $fcmResult,
                'hms' => $hmsResult,
            ]
        );
    }

    protected function shouldSendViaFcm(?string $platform, ?string $pushProvider): bool
    {
        if ($platform === 'ios') {
            return true;
        }

        return ($pushProvider ?? 'fcm') !== 'hms';
    }

    protected function sendToFcmTokens(array $tokens, string $title, string $body, array $data = []): array
    {
        $tokens = collect($tokens)
            ->filter(fn ($token) => is_string($token) && trim($token) !== '')
            ->map(fn ($token) => trim($token))
            ->unique()
            ->values()
            ->all();

        if ($tokens === []) {
            return $this->summary(true, 0, 0, 0, [], []);
        }

        try {
            $message = CloudMessage::new()
                ->withNotification(Notification::create($title, $body))
                ->withData($this->stringifyData($data));

            $report = $this->messaging->sendMulticast($message, $tokens);

            $invalidTokens = array_values(array_unique(array_merge(
                $report->invalidTokens(),
                $report->unknownTokens()
            )));

            if ($invalidTokens !== []) {
                $this->deleteTokens($invalidTokens);
            }

            foreach ($report->failures()->getItems() as $failure) {
                Log::warning('FCM notification send failure', [
                    'token' => $failure->target()->value(),
                    'error' => $failure->error()?->getMessage(),
                ]);
            }

            return $this->summary(
                true,
                count($tokens),
                $report->successes()->count(),
                $report->failures()->count(),
                $invalidTokens,
                []
            );
        } catch (MessagingException|FirebaseException|\Throwable $e) {
            Log::error('FCM send failed', [
                'message' => $e->getMessage(),
                'tokens_count' => count($tokens),
            ]);

            return $this->summary(false, count($tokens), 0, count($tokens), [], []);
        }
    }

    protected function stringifyData(array $data): array
    {
        $payload = [];

        foreach ($data as $key => $value) {
            if (!is_string($key) || $key === '') {
                continue;
            }

            if (is_bool($value)) {
                $payload[$key] = $value ? 'true' : 'false';
                continue;
            }

            if (is_scalar($value) || $value === null) {
                $payload[$key] = (string) ($value ?? '');
                continue;
            }

            $payload[$key] = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
        }

        return $payload;
    }

    protected function deleteTokens(array $tokens): void
    {
        DeviceToken::withoutGlobalScopes()
            ->whereIn('token', $tokens)
            ->delete();
    }

    protected function summary(bool $ok, int $total, int $successes, int $failures, array $invalidTokens, array $providers): array
    {
        return [
            'ok' => $ok,
            'total_tokens' => $total,
            'successes' => $successes,
            'failures' => $failures,
            'invalid_tokens_removed' => count($invalidTokens),
            'invalid_tokens' => $invalidTokens,
            'providers' => $providers,
        ];
    }
}
