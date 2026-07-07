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

    public function fetchGroupContacts(int $tenantId, array $groupJids = []): Response
    {
        return $this->client()->post("/sessions/{$tenantId}/group-contacts/sync", [
            'group_jids' => $groupJids,
        ]);
    }

    /**
     * List every group the tenant's linked account participates in, used by
     * the "choose which groups to sync" multi-select picker.
     */
    public function listGroups(int $tenantId): Response
    {
        return $this->client()->get("/sessions/{$tenantId}/groups");
    }

    /**
     * Ask the mirror service to resolve a batch of WhatsApp LIDs to real
     * phone numbers using the tenant's connected/persisted session.
     *
     * @param  array<int, string>  $lids
     */
    public function resolveLids(int $tenantId, array $lids): Response
    {
        return $this->client()->post("/sessions/{$tenantId}/resolve-lids", [
            'lids' => $lids,
        ]);
    }

    /**
     * List the groups where the tenant's linked WhatsApp account is an
     * admin/superadmin, for the "add contact to group" picker.
     */
    public function adminGroups(int $tenantId): Response
    {
        return $this->client()->get("/sessions/{$tenantId}/admin-groups");
    }

    /**
     * Add a phone number to an existing WhatsApp group.
     */
    public function addParticipantToGroup(int $tenantId, string $groupJid, string $phone): Response
    {
        return $this->client()->post(
            "/sessions/{$tenantId}/groups/" . rawurlencode($groupJid) . '/add-participant',
            ['phone' => $phone]
        );
    }

    public function sendGroupInvite(int $tenantId, string $groupJid, string $phone, ?string $groupName = null): Response
    {
        return $this->client()->post(
            "/sessions/{$tenantId}/groups/" . rawurlencode($groupJid) . '/send-invite',
            [
                'phone' => $phone,
                'group_name' => $groupName,
            ]
        );
    }
}
