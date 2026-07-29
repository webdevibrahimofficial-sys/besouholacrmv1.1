<?php

namespace App\Services;

use App\Models\WebsiteConnection;
use Illuminate\Support\Str;

class WebsiteApiKeyService
{
    public function generate(): array
    {
        $fullKey = 'bs_live_' . Str::random(48);

        return [
            'full_key' => $fullKey,
            'key_prefix' => $this->makePrefix($fullKey),
            'api_key_hash' => $this->hash($fullKey),
        ];
    }

    public function hash(string $fullKey): string
    {
        return hash_hmac('sha256', $fullKey, (string) config('app.key'));
    }

    public function matches(string $fullKey, string $storedHash): bool
    {
        return hash_equals($storedHash, $this->hash($fullKey));
    }

    public function resolveConnection(string $fullKey): ?WebsiteConnection
    {
        return WebsiteConnection::withoutGlobalScopes()
            ->where('api_key_hash', $this->hash($fullKey))
            ->first();
    }

    public function makePrefix(string $fullKey): string
    {
        return substr($fullKey, 0, 16);
    }
}
