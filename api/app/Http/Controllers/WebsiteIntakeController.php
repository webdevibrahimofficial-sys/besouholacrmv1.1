<?php

namespace App\Http\Controllers;

use App\Http\Requests\WebsiteIntakeRequest;
use App\Services\WebsiteLeadIntakeService;
use Illuminate\Http\JsonResponse;

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
        ], 201);
    }
}
