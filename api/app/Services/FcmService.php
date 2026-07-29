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
    public function __construct(protected Messaging $messaging)
    {
    }

    public function sendToUser(User $user, string $title, string $body, array $data = []): array
    {
        $tokens = DeviceToken::withoutGlobalScopes()
            ->where('tenant_id', $user->tenant_id)
            ->where('user_id', $user->id)
            ->pluck('token')
            ->filter()
            ->unique()
            ->values()
            ->all();

        return $this->sendToTokens($tokens, $title, $body, $data);
    }

    public function sendToUsers($users, string $title, string $body, array $data = []): array
    {
        $users = $users instanceof Collection ? $users : collect($users);

        $tokens = DeviceToken::withoutGlobalScopes()
            ->whereIn('user_id', $users->pluck('id')->filter()->unique()->values())
            ->whereIn('tenant_id', $users->pluck('tenant_id')->filter()->unique()->values())
            ->pluck('token')
            ->filter()
            ->unique()
            ->values()
            ->all();

        return $this->sendToTokens($tokens, $title, $body, $data);
    }

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
                $invalidTokens
            );
        } catch (MessagingException|FirebaseException|\Throwable $e) {
            Log::error('FCM send failed', [
                'message' => $e->getMessage(),
                'tokens_count' => count($tokens),
            ]);

            return $this->summary(false, count($tokens), 0, count($tokens), []);
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
