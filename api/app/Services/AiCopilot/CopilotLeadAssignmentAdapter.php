<?php

namespace App\Services\AiCopilot;

use App\Http\Controllers\LeadController;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class CopilotLeadAssignmentAdapter
{
    public function execute(User $user, array $payload): array
    {
        $leadId = (int) ($payload['lead_id'] ?? 0);
        $assignedTo = (int) ($payload['assigned_to'] ?? 0);

        if ($leadId <= 0 || $assignedTo <= 0) {
            return [
                'ok' => false,
                'state' => 'rejected',
                'resource' => 'lead_assignment',
                'requires_confirmation' => false,
                'missing_fields' => array_values(array_filter([
                    $leadId <= 0 ? 'lead_id' : null,
                    $assignedTo <= 0 ? 'assigned_to' : null,
                ])),
                'message' => 'Lead id and assignee are required.',
                'ui_actions' => [],
            ];
        }

        Auth::setUser($user);

        $request = Request::create('/api/leads/bulk-assign', 'POST', [
            'ids' => [$leadId],
            'assigned_to' => $assignedTo,
            'assign_role' => (string) ($payload['assign_role'] ?? 'sales'),
            'stage' => (string) ($payload['stage'] ?? 'same_stage'),
            'history_option' => (string) ($payload['history_option'] ?? 'keep_history'),
        ]);
        $request->setUserResolver(fn () => $user);

        $response = app(LeadController::class)->bulkAssign($request);

        if (! $response instanceof JsonResponse) {
            return [
                'ok' => false,
                'state' => 'failed',
                'resource' => 'lead_assignment',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'message' => 'Lead assignment returned an unexpected response.',
                'ui_actions' => [],
            ];
        }

        $status = $response->getStatusCode();
        $data = $response->getData(true);

        if ($status >= 200 && $status < 300) {
            $assigneeName = trim((string) ($payload['assigned_to_name'] ?? ''));

            return [
                'ok' => true,
                'state' => 'completed',
                'resource' => 'lead_assignment',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'message' => (string) ($data['message'] ?? 'Lead assigned successfully.'),
                'payload' => $payload,
                'ui_actions' => [[
                    'type' => 'navigate',
                    'path' => '/leads?lead_id='.$leadId.'&tab=overview',
                    'pathname' => '/leads',
                    'search' => '?lead_id='.$leadId.'&tab=overview',
                    'label' => $assigneeName !== ''
                        ? ['en' => 'Open lead', 'ar' => 'افتح الليد']
                        : ['en' => 'Open lead', 'ar' => 'افتح الليد'],
                ]],
            ];
        }

        $message = (string) ($data['message'] ?? 'Could not assign the lead.');

        return [
            'ok' => false,
            'state' => 'rejected',
            'resource' => 'lead_assignment',
            'requires_confirmation' => false,
            'missing_fields' => [],
            'message' => $message,
            'payload' => $payload,
            'errors' => is_array($data['errors'] ?? null) ? $data['errors'] : null,
            'ui_actions' => [],
        ];
    }
}
