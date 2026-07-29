<?php

namespace App\Services;

class MetaSignedRequestService
{
    public function parse(string $signedRequest, string $appSecret): ?array
    {
        if (!str_contains($signedRequest, '.')) {
            return null;
        }

        [$encodedSig, $payload] = explode('.', $signedRequest, 2);
        $signature = $this->base64UrlDecode($encodedSig);
        $expectedSignature = hash_hmac('sha256', $payload, $appSecret, true);

        if (!hash_equals($expectedSignature, $signature)) {
            return null;
        }

        $data = json_decode($this->base64UrlDecode($payload), true);

        return is_array($data) ? $data : null;
    }

    protected function base64UrlDecode(string $input): string
    {
        return base64_decode(strtr($input, '-_', '+/'), true) ?: '';
    }
}
