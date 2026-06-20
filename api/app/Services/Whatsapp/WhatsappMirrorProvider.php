<?php

namespace App\Services\Whatsapp;

use App\Contracts\WhatsappProviderInterface;
use App\Models\WhatsappMessage;
use Exception;

class WhatsappMirrorProvider implements WhatsappProviderInterface
{
    protected WhatsappMirrorClient $client;

    public function __construct(WhatsappMirrorClient $client)
    {
        $this->client = $client;
    }

    public function sendText(int $tenantId, string $to, string $body): array
    {
        $response = $this->client->send($tenantId, $to, $body);

        if (!$response->successful()) {
            throw new Exception("WhatsApp Mirror failed to send message: " . $response->body());
        }

        $data = $response->json();

        $message = WhatsappMessage::create([
            'tenant_id' => $tenantId,
            'provider' => 'mirror',
            'direction' => 'outbound',
            'to' => $to,
            'body' => $body,
            'message_id' => $data['messageId'] ?? null,
            'status' => 'sent',
        ]);

        return [
            'success' => true,
            'message_id' => $message->message_id,
            'db_id' => $message->id
        ];
    }

    public function sendTemplate(int $tenantId, string $to, string $templateName, string $languageCode, array $components = []): array
    {
        throw new Exception("Templates are not supported on WhatsApp Mirror provider.");
    }

    public function testConnection(int $tenantId): array
    {
        $response = $this->client->status($tenantId);
        $status = $response->json()['status'] ?? 'disconnected';

        return [
            'success' => $status === 'connected',
            'status' => $status
        ];
    }
}
