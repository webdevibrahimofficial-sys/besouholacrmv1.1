<?php

namespace App\Http\Controllers;

use App\Services\WebsiteAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicWebsiteEventController extends Controller
{
    public function __construct(private readonly WebsiteAnalyticsService $analyticsService)
    {
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tenant_slug' => ['required', 'string', 'max:100'],
            'session_id' => ['required', 'string', 'max:64'],
            'event_name' => ['required', 'string', 'max:50'],
            'page_url' => ['nullable', 'string', 'max:2048'],
            'page_path' => ['nullable', 'string', 'max:500'],
            'form_name' => ['nullable', 'string', 'max:100'],
            'service_slug' => ['nullable', 'string', 'max:255'],
            'utm_source' => ['nullable', 'string', 'max:100'],
            'utm_campaign' => ['nullable', 'string', 'max:100'],
            'utm_medium' => ['nullable', 'string', 'max:100'],
            'referrer' => ['nullable', 'string', 'max:2048'],
            'device' => ['nullable', 'string', 'max:50'],
            'browser' => ['nullable', 'string', 'max:100'],
            'timestamp' => ['nullable', 'date'],
            'meta' => ['nullable', 'array'],
        ]);

        try {
            $result = $this->analyticsService->recordEvent(
                $validated['tenant_slug'],
                $validated,
                $request
            );
        } catch (\InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Event recorded.',
            ...$result,
        ], 201);
    }
}
