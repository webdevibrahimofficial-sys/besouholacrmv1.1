<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\WhatsappMirrorSession;
use App\Models\WhatsappSetting;
use App\Jobs\ProcessIncomingMirrorMessage;
use App\Jobs\ProcessHistorySyncBatch;

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
            WhatsappMirrorSession::updateOrCreate(
                ['tenant_id' => $tenantId],
                [
                    'status' => $payload['status'],
                    'connected_phone_number' => $payload['connected_phone_number'] ?? null,
                    'last_connected_at' => $payload['status'] === 'connected' ? now() : null,
                    'last_disconnected_at' => $payload['status'] === 'disconnected' ? now() : null,
                ]
            );

            if ($payload['status'] === 'connected') {
                WhatsappSetting::updateOrCreate(
                    ['tenant_id' => $tenantId],
                    ['provider' => 'mirror']
                );
            }
        }

        if (($payload['event'] ?? null) === 'message_received') {
            (new ProcessIncomingMirrorMessage($payload))->handle();
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

        // Guard against re-running: skip if history was already synced more than 5 minutes ago.
        if ($session?->history_synced_at && now()->diffInMinutes($session->history_synced_at) > 5) {
            return response()->json(['success' => true, 'skipped' => true]);
        }

        $messages = (array) ($payload['messages'] ?? []);
        $isLatest = (bool) ($payload['is_latest'] ?? false);

        // Process synchronously to avoid Spatie multitenancy queue issues.
        // Once the job is properly tenant-aware, this should be switched to ::dispatch().
        (new ProcessHistorySyncBatch($tenantId, $messages, $isLatest))->handle();

        return response()->json(['success' => true, 'processed' => count($messages)]);
    }
}
