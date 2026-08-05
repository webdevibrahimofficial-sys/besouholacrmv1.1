<?php

namespace App\Http\Controllers;

use App\Models\DeviceToken;
use App\Services\FcmService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceTokenController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => 'required|string|max:500',
            'platform' => 'nullable|string|in:android,ios',
            'device_name' => 'nullable|string|max:100',
            'push_provider' => 'nullable|string|in:fcm,hms',
        ]);

        $user = $request->user();

        DeviceToken::withoutGlobalScopes()->updateOrCreate(
            ['token' => $validated['token']],
            [
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'platform' => $validated['platform'] ?? null,
                'device_name' => $validated['device_name'] ?? null,
                'push_provider' => $validated['push_provider'] ?? 'fcm',
                'last_used_at' => now(),
            ]
        );

        return response()->json([
            'message' => 'Device token saved successfully',
        ]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => 'required|string|max:500',
        ]);

        DeviceToken::query()
            ->where('user_id', $request->user()->id)
            ->where('token', $validated['token'])
            ->delete();

        return response()->json([
            'message' => 'Device token deleted successfully',
        ]);
    }

    public function testNotification(Request $request, FcmService $fcmService): JsonResponse
    {
        if (app()->environment('production')) {
            return response()->json([
                'message' => 'Not available in production',
            ], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'body' => 'required|string|max:1000',
            'data' => 'nullable|array',
        ]);

        $result = $fcmService->sendToUser(
            $request->user(),
            $validated['title'],
            $validated['body'],
            $validated['data'] ?? []
        );

        return response()->json([
            'message' => 'Test notification processed',
            'result' => $result,
        ]);
    }
}
