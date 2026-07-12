<?php

namespace App\Services;

use Illuminate\Contracts\Encryption\DecryptException;
use Illuminate\Support\Facades\Crypt;

class IntegrationSecretsService
{
    public function encryptSecret(string $value): string
    {
        return Crypt::encryptString($value);
    }

    public function decryptSecret(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            return Crypt::decryptString($value);
        } catch (DecryptException) {
            return $value;
        }
    }

    public function maskSecret(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $len = strlen($value);
        if ($len <= 6) {
            return str_repeat('*', $len);
        }

        return substr($value, 0, 2) . str_repeat('*', $len - 4) . substr($value, -2);
    }

    public function shouldPersistSecret(?string $value): bool
    {
        $secret = trim((string) $value);

        return $secret !== '' && !preg_match('/\*{2,}/', $secret);
    }
}
