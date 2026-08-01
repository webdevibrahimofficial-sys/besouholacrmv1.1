<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WhatsappMirrorSession;
use App\Services\Whatsapp\WhatsappChannelService;
use App\Services\Whatsapp\WhatsappMirrorClient;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class WhatsappMirrorController extends Controller
{
    protected const RECONNECT_GRACE_SECONDS = 20;

    protected WhatsappMirrorClient $client;
    protected WhatsappChannelService $channelService;
    protected ?bool $hasShouldRestoreColumn = null;

    public function __construct(WhatsappMirrorClient $client, WhatsappChannelService $channelService)
    {
        $this->client = $client;
        $this->channelService = $channelService;
    }

    public function pair(Request $request)
    {
        $tenantId = auth()->user()->tenant_id;
        $forcePair = $request->boolean('force');
        $statusResponse = $this->client->status($tenantId);

        if ($this->supportsShouldRestore()) {
            WhatsappMirrorSession::updateOrCreate(
                ['tenant_id' => $tenantId],
                ['should_restore' => true]
            );
        }

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
            ->update(array_filter([
                'status' => 'disconnected',
                'should_restore' => $this->supportsShouldRestore() ? false : null,
                'connected_phone_number' => null,
                'last_disconnected_at' => now(),
                'history_synced_at' => null,
                'reconnect_reason' => 'manual_disconnect',
                'reconnect_detail' => 'Disconnected manually by the user.',
            ], static fn ($value) => $value !== null));

        $this->channelService->markMirrorDisconnected((int) $tenantId);

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
        if (($session?->reconnect_reason ?? null) === 'manual_disconnect') {
            return 'disconnected';
        }

        if ($this->supportsShouldRestore() && ! $session?->should_restore) {
            return 'disconnected';
        }

        if ($remoteStatus === 'pending_qr') {
            return 'pending_qr';
        }

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

    protected function supportsShouldRestore(): bool
    {
        if ($this->hasShouldRestoreColumn !== null) {
            return $this->hasShouldRestoreColumn;
        }

        return $this->hasShouldRestoreColumn = Schema::hasColumn('whatsapp_mirror_sessions', 'should_restore');
    }
}
