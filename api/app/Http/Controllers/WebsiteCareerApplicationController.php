<?php

namespace App\Http\Controllers;

use App\Http\Requests\WebsiteCareerApplicationRequest;
use App\Services\WebsiteCareerApplicationService;
use Illuminate\Http\JsonResponse;

class WebsiteCareerApplicationController extends Controller
{
    public function __construct(private readonly WebsiteCareerApplicationService $careerApplicationService)
    {
    }

    public function store(WebsiteCareerApplicationRequest $request, string $apiKey): JsonResponse
    {
        $application = $this->careerApplicationService->handle($apiKey, $request->validated(), $request);

        return response()->json([
            'message' => 'Application submitted successfully.',
            'application_id' => $application->id,
            'status' => $application->status,
        ], 201);
    }
}
