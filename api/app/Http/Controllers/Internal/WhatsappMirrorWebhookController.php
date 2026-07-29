<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\WhatsappChannel;
use App\Models\WhatsappMirrorSession;
use App\Models\WhatsappSetting;
use App\Jobs\ProcessIncomingMirrorMessage;
use App\Jobs\ProcessHistorySyncBatch;
use App\Services\Whatsapp\WhatsappChannelService;
use App\Services\Whatsapp\WhatsappContactStoreService;

class WhatsappMirrorWebhookController extends Controller
{
    public function handle(Request $request)
    {
        if ($request->header('X-Internal-Token') !== config('services.wa_mirror.token')) {
            return response()->json(['error' => 'Unauthorized Internal Token'], 401);
        }

        $payload = $request->all();
        $tenantId = $payload['tenant_id'] ?? null;

        if (!$tenantId) {
            return response()->json(['error' => 'Missing tenant_id'], 400);
        }

        if (($payload['event'] ?? null) === 'status_change') {
            $existingSession = WhatsappMirrorSession::where('tenant_id', $tenantId)->first();

            WhatsappMirrorSession::updateOrCreate(
                ['tenant_id' => $tenantId],
                [
                    'status' => $payload['status'],
                    'connected_phone_number' => $payload['connected_phone_number']
                        ?? $existingSession?->connected_phone_number,
                    'last_connected_at' => $payload['status'] === 'connected'
                        ? now()
                        : $existingSession?->last_connected_at,
                    'last_disconnected_at' => in_array($payload['status'], ['disconnected', 'reconnect_failed'], true)
                        ? now()
                        : $existingSession?->last_disconnected_at,
                    'reconnect_reason' => in_array($payload['status'], ['connected', 'pending_qr'], true)
                        ? null
                        : ($payload['reconnect_reason'] ?? $existingSession?->reconnect_reason),
                    'reconnect_detail' => in_array($payload['status'], ['connected', 'pending_qr'], true)
                        ? null
                        : ($payload['reconnect_detail'] ?? $existingSession?->reconnect_detail),
                ]
            );

            if ($payload['status'] === 'connected') {
                WhatsappSetting::updateOrCreate(
                    ['tenant_id' => $tenantId],
                    ['provider' => 'mirror']
                );

                $channelService = app(WhatsappChannelService::class);
                $mirrorChannel = WhatsappChannel::query()->firstOrCreate(
                    [
                        'tenant_id' => $tenantId,
                        'provider' => WhatsappChannel::PROVIDER_MIRROR,
                    ],
                    [
                        'display_name' => 'WhatsApp Mirror',
                        'supports_ctwa_attribution' => false,
                    ]
                );

                if (! WhatsappChannel::query()->where('tenant_id', $tenantId)->where('is_primary', true)->exists()) {
                    $mirrorChannel->is_primary = true;
                    $mirrorChannel->save();
                }

                $channelService->syncMirrorChannel((int) $tenantId, $mirrorChannel);
            }
        }

        if (($payload['event'] ?? null) === 'message_received') {
            (new ProcessIncomingMirrorMessage($payload))->handle();
        }

        // Contact Resolver Layer: contacts.upsert / contacts.update batches pushed
        // by the mirror service so we keep a persistent jid/lid/phone/name cache
        // independent of any single group snapshot (mirrors what WhatsApp Web
        // itself relies on internally).
        if (($payload['event'] ?? null) === 'contact_update') {
            $contacts = array_values(array_filter((array) ($payload['contacts'] ?? []), fn ($c) => is_array($c)));
            app(WhatsappContactStoreService::class)->upsertMany((int) $tenantId, $contacts);
        }

        if (($payload['event'] ?? null) === 'message_status_update') {
            \App\Models\WhatsappMessage::query()
                ->where('tenant_id', $tenantId)
                ->where('message_id', $payload['message_id'] ?? null)
                ->update(['status' => $payload['status'] ?? 'sent_to_session']);
        }

        return response()->json(['success' => true]);
    }

    public function historySync(Request $request)
    {
        if ($request->header('X-Internal-Token') !== config('services.wa_mirror.token')) {
            return response()->json(['error' => 'Unauthorized Internal Token'], 401);
        }

        $payload = $request->all();
        $tenantId = (int) ($payload['tenant_id'] ?? 0);

        if (!$tenantId) {
            return response()->json(['error' => 'Missing tenant_id'], 400);
        }

        $session = WhatsappMirrorSession::where('tenant_id', $tenantId)->first();

        // Guard against re-running the SAME sync burst: skip only if synced
        // recently (within 2 minutes) AND this is NOT a fresh isLatest batch.
        // We must NOT block subsequent syncs after reconnects.
        $isLatest = (bool) ($payload['is_latest'] ?? false);
        if (
            !$isLatest
            && $session?->history_synced_at
            && now()->diffInMinutes($session->history_synced_at) < 2
        ) {
            return response()->json(['success' => true, 'skipped' => true]);
        }

        $messages = (array) ($payload['messages'] ?? []);

        // Process synchronously to avoid Spatie multitenancy queue issues.
        // Once the job is properly tenant-aware, this should be switched to ::dispatch().
        (new ProcessHistorySyncBatch($tenantId, $messages, $isLatest))->handle();

        return response()->json(['success' => true, 'processed' => count($messages)]);
    }
}
