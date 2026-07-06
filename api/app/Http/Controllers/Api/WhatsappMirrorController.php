<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Whatsapp\WhatsappMirrorClient;
use Illuminate\Http\Request;

class WhatsappMirrorController extends Controller
{
    protected WhatsappMirrorClient $client;

    public function __construct(WhatsappMirrorClient $client)
    {
        $this->client = $client;
    }

    public function pair(Request $request)
    {
        $tenantId = auth()->user()->tenant_id;
        $response = $this->client->pair($tenantId);
        return response()->json($response->json(), $response->status());
    }

    public function status()
    {
        $tenantId = auth()->user()->tenant_id;
        $response = $this->client->status($tenantId);
        $data = $response->json() ?? [];

        $session = \App\Models\WhatsappMirrorSession::where('tenant_id', $tenantId)->first();
        $data['history_synced_at'] = $session?->history_synced_at?->toISOString() ?? null;
        $data['connected_phone_number'] = $session?->connected_phone_number ?? null;

        return response()->json($data, $response->status());
    }

    public function disconnect()
    {
        $tenantId = auth()->user()->tenant_id;
        $response = $this->client->disconnect($tenantId);

        // A disconnect invalidates the Baileys auth state; a subsequent pair
        // is a fresh pairing and should be allowed to run history sync again.
        \App\Models\WhatsappMirrorSession::where('tenant_id', $tenantId)
            ->update(['history_synced_at' => null]);

        return response()->json($response->json(), $response->status());
    }
}
