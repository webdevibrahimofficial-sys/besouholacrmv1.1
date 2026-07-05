<?php

namespace App\Services\Whatsapp;

use Illuminate\Support\Facades\Http;
use Illuminate\Http\Client\Response;

class WhatsappMirrorClient
{
    protected string $baseUrl;
    protected string $token;

    public function __construct()
    {
        $this->baseUrl = config('services.wa_mirror.url');
        $this->token = config('services.wa_mirror.token');
    }

    protected function client()
    {
        return Http::withHeaders([
            'X-Internal-Token' => $this->token,
            'Content-Type' => 'application/json',
        ])->baseUrl($this->baseUrl);
    }

    public function pair(int $tenantId): Response
    {
        return $this->client()->post("/sessions/{$tenantId}/pair");
    }

    public function status(int $tenantId): Response
    {
        return $this->client()->get("/sessions/{$tenantId}/status");
    }

    public function send(int $tenantId, string $to, string $body): Response
    {
        return $this->client()->post("/sessions/{$tenantId}/send", [
            'to' => $to,
            'body' => $body
        ]);
    }

    public function disconnect(int $tenantId): Response
    {
        return $this->client()->delete("/sessions/{$tenantId}");
    }

    public function fetchGroupContacts(int $tenantId): Response
    {
        return $this->client()->post("/sessions/{$tenantId}/group-contacts/sync");
    }
}
