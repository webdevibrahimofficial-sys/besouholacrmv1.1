<?php

namespace App\Http\Controllers;

use App\Http\Requests\WebsiteIntakeRequest;
use App\Services\WebsiteLeadIntakeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

class WebsiteIntakeController extends Controller
{
    public function __construct(private readonly WebsiteLeadIntakeService $intakeService)
    {
    }

    public function store(WebsiteIntakeRequest $request, string $apiKey): JsonResponse
    {
        $result = $this->intakeService->handle($apiKey, $request->validated(), $request);

        return response()->json([
            'message' => 'Lead submitted successfully.',
            'lead_id' => $result['lead']->id,
            'status' => $result['status'],
            'report_url' => $result['report_url'] ?? null,
            'report_path' => $result['report_path'] ?? null,
        ], 201);
    }

    public function downloadLeadLeakReport(int $tenantId, int $leadId, string $filename)
    {
        if (!preg_match('/^lead-leak-report-\d+\.pdf$/', $filename)) {
            abort(404);
        }

        $path = "tenants/{$tenantId}/leads/{$leadId}/attachments/{$filename}";
        if (!Storage::disk('public')->exists($path)) {
            abort(404);
        }

        return Storage::disk('public')->download($path, $filename, [
            'Content-Type' => 'application/pdf',
        ]);
    }
}
