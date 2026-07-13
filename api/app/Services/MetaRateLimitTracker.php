<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

class MetaRateLimitTracker
{
    private const COUNTER_KEY = 'meta:rate_limit_events_24h';

    private const LOG_KEY = 'meta:rate_limit_log';

    private const LOG_LIMIT = 50;

    public function record(string $endpoint, int $code, string $message): void
    {
        $counter = (int) Cache::get(self::COUNTER_KEY, 0);
        Cache::put(self::COUNTER_KEY, $counter + 1, now()->addDay());

        $log = Cache::get(self::LOG_KEY, []);
        if (! is_array($log)) {
            $log = [];
        }

        array_unshift($log, [
            'endpoint' => $endpoint,
            'code' => $code,
            'message' => $message,
            'recorded_at' => now()->toIso8601String(),
        ]);

        Cache::put(self::LOG_KEY, array_slice($log, 0, self::LOG_LIMIT), now()->addDay());
    }

    public function countLast24Hours(): int
    {
        return (int) Cache::get(self::COUNTER_KEY, 0);
    }

    /**
     * @return array<int, array{endpoint: string, code: int, message: string, recorded_at: string}>
     */
    public function recentEvents(int $limit = 20): array
    {
        $log = Cache::get(self::LOG_KEY, []);

        if (! is_array($log)) {
            return [];
        }

        return array_slice($log, 0, max(1, $limit));
    }
}
