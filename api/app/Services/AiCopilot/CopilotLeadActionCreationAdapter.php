<?php

namespace App\Services\AiCopilot;

use App\Http\Controllers\LeadActionController;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CopilotLeadActionCreationAdapter
{
    public function execute(User $user, array $payload): array
    {
        Auth::setUser($user);

        $request = Request::create('/api/lead-actions', 'POST', $payload);
        $request->setUserResolver(fn () => $user);

        $response = app(LeadActionController::class)->store($request);

        if (! $response instanceof JsonResponse) {
            return [
                'ok' => false,
                'state' => 'failed',
                'resource' => 'lead_action',
                'message' => 'Lead action flow returned an unexpected response.',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'ui_actions' => [],
            ];
        }

        $status = $response->getStatusCode();
        $data = $response->getData(true);

        if ($status >= 200 && $status < 300) {
            $leadId = (int) ($payload['lead_id'] ?? 0);

            return [
                'ok' => true,
                'state' => 'completed',
                'resource' => 'lead_action',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'message' => (string) ($data['message'] ?? 'Lead action created successfully.'),
                'action' => is_array($data['action'] ?? null) ? $data['action'] : null,
                'payload' => $payload,
                'ui_actions' => $leadId > 0 ? [[
                    'type' => 'navigate',
                    'path' => '/leads/'.$leadId,
                    'label' => 'Open lead',
                ]] : [],
            ];
        }

        $message = (string) ($data['message'] ?? 'Could not create the lead action.');
        if ($message === '' && is_array($data['errors'] ?? null)) {
            $first = collect($data['errors'])->flatten()->first();
            if (is_string($first) && $first !== '') {
                $message = $first;
            }
        }

        return [
            'ok' => false,
            'state' => 'rejected',
            'resource' => 'lead_action',
            'requires_confirmation' => false,
            'missing_fields' => [],
            'message' => $message,
            'payload' => $payload,
            'errors' => is_array($data['errors'] ?? null) ? $data['errors'] : null,
            'ui_actions' => [],
        ];
    }
}

