<?php

namespace App\Services\AiCopilot;

use App\Http\Controllers\LeadController;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CopilotLeadCreationAdapter
{
    public function execute(User $user, array $payload): array
    {
        Auth::setUser($user);

        $request = Request::create('/api/leads', 'POST', $payload);
        $request->setUserResolver(fn () => $user);

        $response = app(LeadController::class)->store($request);

        if (! $response instanceof JsonResponse) {
            return [
                'ok' => false,
                'state' => 'failed',
                'resource' => 'lead',
                'message' => 'Lead flow returned an unexpected response.',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'ui_actions' => [],
            ];
        }

        $status = $response->getStatusCode();
        $data = $response->getData(true);

        if ($status >= 200 && $status < 300) {
            $leadId = (int) ($data['id'] ?? 0);

            return [
                'ok' => true,
                'state' => 'completed',
                'resource' => 'lead',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'message' => 'Lead created successfully.',
                'payload' => $payload,
                'lead' => [
                    'id' => $leadId,
                    'name' => $data['name'] ?? null,
                    'phone' => $data['phone'] ?? null,
                    'source' => $data['source'] ?? null,
                ],
                'ui_actions' => $leadId > 0 ? [[
                    'type' => 'navigate',
                    'path' => '/leads/'.$leadId,
                    'label' => 'Open lead',
                ]] : [],
            ];
        }

        $message = (string) ($data['message'] ?? 'Could not create the lead.');
        if ($message === '' && is_array($data['errors'] ?? null)) {
            $first = collect($data['errors'])->flatten()->first();
            if (is_string($first) && $first !== '') {
                $message = $first;
            }
        }

        return [
            'ok' => false,
            'state' => 'rejected',
            'resource' => 'lead',
            'requires_confirmation' => false,
            'missing_fields' => [],
            'message' => $message,
            'payload' => $payload,
            'errors' => is_array($data['errors'] ?? null) ? $data['errors'] : null,
            'ui_actions' => [],
        ];
    }
}
