<?php

namespace App\Http\Controllers;

use App\Services\WebsiteAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WebsiteAnalyticsController extends Controller
{
    public function __construct(private readonly WebsiteAnalyticsService $analyticsService)
    {
    }

    public function overview(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;
        $from = $request->query('from');
        $to = $request->query('to');

        return response()->json($this->analyticsService->overview($tenantId, $from, $to));
    }

    public function pages(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        return response()->json(
            $this->analyticsService->pages($tenantId, $request->query('from'), $request->query('to'))
        );
    }

    public function forms(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        return response()->json(
            $this->analyticsService->forms($tenantId, $request->query('from'), $request->query('to'))
        );
    }

    public function campaigns(Request $request): JsonResponse
    {
        $tenantId = (int) $request->user()->tenant_id;

        return response()->json(
            $this->analyticsService->campaigns($tenantId, $request->query('from'), $request->query('to'))
        );
    }
}
