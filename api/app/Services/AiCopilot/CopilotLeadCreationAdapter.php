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

        if (! empty($payload['secondary_phone'])) {
            $secondaryPhone = (string) $payload['secondary_phone'];

            $customFields = is_array($payload['custom_fields'] ?? null) ? $payload['custom_fields'] : [];
            $customFields['phone2'] = $secondaryPhone;
            $payload['custom_fields'] = $customFields;

            $metaData = is_array($payload['meta_data'] ?? null) ? $payload['meta_data'] : [];
            $metaData['other_phone'] = $secondaryPhone;
            $metaData['other_mobile'] = $secondaryPhone;
            $payload['meta_data'] = $metaData;

            unset($payload['secondary_phone']);
        }

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
            $uiActions = [];

            if ($leadId > 0) {
                $uiActions[] = [
                    'type' => 'navigate',
                    'path' => '/leads?lead_id='.$leadId.'&tab=overview',
                    'pathname' => '/leads',
                    'search' => '?lead_id='.$leadId.'&tab=overview',
                    'label' => 'Open lead',
                ];
                $uiActions[] = [
                    'type' => 'prompt_message',
                    'message' => 'Suggest the best tenant item or project and handling tips for lead '.$leadId,
                    'label' => 'Suggest best fit',
                ];
                $uiActions[] = [
                    'type' => 'prompt_message',
                    'message' => 'Give me smart follow-up advice for lead '.$leadId,
                    'label' => 'Get follow-up tips',
                ];
            }

            return [
                'ok' => true,
                'state' => 'completed',
                'resource' => 'lead',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'message' => 'Lead created successfully. You can ask for best-fit suggestions or follow-up tips next.',
                'payload' => $payload,
                'lead' => [
                    'id' => $leadId,
                    'name' => $data['name'] ?? null,
                    'phone' => $data['phone'] ?? null,
                    'source' => $data['source'] ?? null,
                ],
                'ui_actions' => $uiActions,
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
