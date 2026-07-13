<?php

namespace App\Http\Controllers;

use App\Services\MetaCapiService;
use Illuminate\Http\Request;

class MetaCapiController extends Controller
{
    public function __construct(protected MetaCapiService $capiService)
    {
    }

    public function test(Request $request)
    {
        $payload = $request->validate([
            'pixel_id' => 'required|string',
            'event_name' => 'required|string',
            'event_time' => 'nullable|integer',
            'event_source_url' => 'nullable|string',
            'action_source' => 'nullable|string',
            'user_data' => 'nullable|array',
            'custom_data' => 'nullable|array',
        ]);

        $tenantId = $request->user()?->tenant_id;
        $result = $this->capiService->sendTestEvent($tenantId, $payload);

        return response()->json($result);
    }
}
