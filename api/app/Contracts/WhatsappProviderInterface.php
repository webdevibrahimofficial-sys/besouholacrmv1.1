<?php

namespace App\Contracts;

interface WhatsappProviderInterface
{
    public function sendTemplate(int $tenantId, string $to, string $template, string $language = 'en_US', array $variables = []): array;

    public function sendText(int $tenantId, string $to, string $body): array;

    public function sendMedia(
        int $tenantId,
        string $to,
        string $mediaType,
        string $mediaUrl,
        ?string $caption = null,
        ?string $filename = null
    ): array;

    public function testConnection(int $tenantId, array $credentials = []): array;
}
