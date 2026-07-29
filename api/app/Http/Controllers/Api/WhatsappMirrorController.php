<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WhatsappMirrorSession;
use App\Services\Whatsapp\WhatsappMirrorClient;
use Illuminate\Http\Request;

class WhatsappMirrorController extends Controller
{
    protected const RECONNECT_GRACE_SECONDS = 20;

    protected WhatsappMirrorClient $client;

    public function __construct(WhatsappMirrorClient $client)
    {
        $this->client = $client;
    }

    public function pair(Request $request)
    {
        $tenantId = auth()->user()->tenant_id;
        $forcePair = $request->boolean('force');
        $statusResponse = $this->client->status($tenantId);

        if (!$forcePair && $statusResponse->successful()) {
            $statusPayload = $statusResponse->json() ?? [];
            $currentStatus = (string) ($statusPayload['status'] ?? 'disconnected');

            if (in_array($currentStatus, ['connected', 'reconnecting', 'pending_qr'], true)) {
                return response()->json($statusPayload, $statusResponse->status());
            }
        }

        $response = $this->client->pair($tenantId);
        return response()->json($response->json(), $response->status());
    }

    public function status()
    {
        $tenantId = auth()->user()->tenant_id;
        $response = $this->client->status($tenantId);
        $data = $response->json() ?? [];

        $session = WhatsappMirrorSession::where('tenant_id', $tenantId)->first();
        $localStatus = (string) ($session?->status ?? 'disconnected');
        $remoteStatus = (string) ($data['status'] ?? 'disconnected');
        $data['status'] = $this->resolveDisplayedStatus($session, $remoteStatus, $localStatus);

        $data['history_synced_at'] = $session?->history_synced_at?->toISOString() ?? null;
        $data['connected_phone_number'] = $session?->connected_phone_number ?? null;
        $data['reconnect_reason'] = $data['reconnect_reason'] ?? $session?->reconnect_reason;
        $data['reconnect_detail'] = $data['reconnect_detail'] ?? $session?->reconnect_detail;

        return response()->json($data, $response->status());
    }

    public function disconnect()
    {
        $tenantId = auth()->user()->tenant_id;
        $response = $this->client->disconnect($tenantId);

        // A disconnect invalidates the Baileys auth state; a subsequent pair
        // is a fresh pairing and should be allowed to run history sync again.
        WhatsappMirrorSession::where('tenant_id', $tenantId)
            ->update([
                'history_synced_at' => null,
                'reconnect_reason' => null,
                'reconnect_detail' => null,
            ]);

        return response()->json($response->json(), $response->status());
    }

    public function adminGroups()
    {
        $tenantId = auth()->user()->tenant_id;
        $response = $this->client->adminGroups($tenantId);

        if (!$response->successful()) {
            return response()->json($response->json(), $response->status());
        }

        return response()->json($response->json('groups') ?? []);
    }

    protected function resolveDisplayedStatus(?WhatsappMirrorSession $session, string $remoteStatus, string $localStatus): string
    {
        if ($remoteStatus !== 'disconnected') {
            return $remoteStatus;
        }

        if ($localStatus === 'reconnect_failed') {
            return 'reconnect_failed';
        }

        if (
            !$session?->connected_phone_number
            || !in_array($localStatus, ['connected', 'reconnecting'], true)
        ) {
            return 'disconnected';
        }

        $disconnectedAt = $session->last_disconnected_at;
        $stillWithinGraceWindow = $disconnectedAt
            && now()->diffInSeconds($disconnectedAt) <= self::RECONNECT_GRACE_SECONDS;

        if ($stillWithinGraceWindow) {
            if ($localStatus !== 'reconnecting') {
                $session->forceFill(['status' => 'reconnecting'])->save();
            }

            return 'reconnecting';
        }

        $session->forceFill(['status' => 'reconnect_failed'])->save();

        return 'reconnect_failed';
    }
}
