<?php

namespace App\Http\Controllers;

use App\Services\AiCopilot\AiCopilotChatService;
use App\Services\AiCopilot\AiCopilotToolExecutor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiCopilotController extends Controller
{
    public function __construct(
        private readonly AiCopilotChatService $chatService,
        private readonly AiCopilotToolExecutor $toolExecutor
    ) {
    }

    public function status(Request $request): JsonResponse
    {
        $user = $request->user();
        $tenantId = app()->bound('current_tenant_id')
            ? app('current_tenant_id')
            : $user?->tenant_id;
        $tenant = $tenantId ? \App\Models\Tenant::find($tenantId) : null;

        return response()->json([
            'data' => [
                'feature' => 'besouhola_copilot',
                'enabled' => true,
                'tenant' => [
                    'id' => $tenant?->id,
                    'name' => $tenant?->name,
                    'slug' => $tenant?->slug,
                ],
                'user' => [
                    'id' => $user?->id,
                    'name' => $user?->name,
                    'email' => $user?->email,
                ],
                'message' => 'Besouhola Copilot is enabled for this workspace.',
            ],
        ]);
    }

    public function chat(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message' => 'required|string|max:4000',
            'conversation_id' => 'nullable|integer',
        ]);

        $result = $this->chatService->chat(
            $request->user(),
            trim($validated['message']),
            $validated['conversation_id'] ?? null
        );

        return response()->json(['data' => $result]);
    }

    public function confirmAction(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'action' => 'required|string|in:create_task_for_lead,create_lead_action,create_lead',
            'payload' => 'required|array',
        ]);

        $result = $this->toolExecutor->confirm(
            $request->user(),
            $validated['action'],
            $validated['payload']
        );

        return response()->json(['data' => $result], ($result['ok'] ?? false) ? 200 : 403);
    }
}


