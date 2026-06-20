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
        return response()->json($response->json(), $response->status());
    }

    public function disconnect()
    {
        $tenantId = auth()->user()->tenant_id;
        $response = $this->client->disconnect($tenantId);
        return response()->json($response->json(), $response->status());
    }
}
