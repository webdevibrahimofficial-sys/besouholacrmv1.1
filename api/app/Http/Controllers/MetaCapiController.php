<?php

namespace App\Http\Controllers;

use App\Contracts\MetaApiClientInterface;
use App\Services\MetaSystemSettingsService;
use Illuminate\Http\Request;

class MetaCapiController extends Controller
{
    public function __construct(
        protected MetaApiClientInterface $apiClient,
        protected MetaSystemSettingsService $metaSystemSettings
    ) {
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

        if (config('services.meta.mock_mode')) {
            return response()->json([
                'ok' => true,
                'mock' => true,
                'message' => 'CAPI test event accepted in mock mode.',
                'payload' => $payload,
            ]);
        }

        $credentials = $this->metaSystemSettings->resolveSharedCredentials();
        $pixelId = $payload['pixel_id'];

        $event = [
            'event_name' => $payload['event_name'],
            'event_time' => $payload['event_time'] ?? time(),
            'action_source' => $payload['action_source'] ?? 'website',
            'event_source_url' => $payload['event_source_url'] ?? config('app.frontend_url'),
            'user_data' => $payload['user_data'] ?? [],
            'custom_data' => $payload['custom_data'] ?? [],
        ];

        $response = $this->apiClient->post("/{$pixelId}/events", [
            'data' => [$event],
            'access_token' => $credentials['app_id'] . '|' . $credentials['app_secret'],
        ]);

        return response()->json([
            'ok' => true,
            'message' => 'CAPI test event sent.',
            'response' => $response,
        ]);
    }
}
