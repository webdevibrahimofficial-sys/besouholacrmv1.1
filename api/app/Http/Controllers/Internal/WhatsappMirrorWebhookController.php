<?php

namespace App\Http\Controllers\Internal;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\WhatsappMirrorSession;
use App\Jobs\ProcessIncomingMirrorMessage;

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
        }

        if (($payload['event'] ?? null) === 'message_received') {
            (new ProcessIncomingMirrorMessage($payload))->handle();
        }

        return response()->json(['success' => true]);
    }
}
