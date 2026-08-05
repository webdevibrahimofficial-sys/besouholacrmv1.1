<?php

namespace App\Services\AiCopilot;

use App\Models\Item;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\User;
use App\Support\TenantSourceLookup;

class CopilotLeadDraftService
{
    public function build(User $user, array $args): array
    {
        $tenant = Tenant::find($user->tenant_id);
        $companyType = strtolower(trim((string) ($tenant?->company_type ?? 'general')));
        $isGeneral = $companyType === 'general';

        $name = trim((string) ($args['name'] ?? ''));
        $phone = trim((string) ($args['phone'] ?? ''));
        $email = trim((string) ($args['email'] ?? ''));
        $sourceInput = trim((string) ($args['source'] ?? ''));
        $itemInput = trim((string) ($args['item'] ?? ''));
        $projectInput = trim((string) ($args['project'] ?? ''));
        $tenantId = (int) ($user->tenant_id ?? 0);
        $itemId = isset($args['item_id']) ? (int) $args['item_id'] : null;
        $projectId = isset($args['project_id']) ? (int) $args['project_id'] : null;

        if ($isGeneral && ! $itemId && $itemInput !== '') {
            $itemId = Item::query()
                ->where('tenant_id', $tenantId)
                ->whereRaw('LOWER(name) = ?', [mb_strtolower($itemInput, 'UTF-8')])
                ->value('id');
        }

        if (! $isGeneral && ! $projectId && $projectInput !== '') {
            $projectId = Project::query()
                ->where('tenant_id', $tenantId)
                ->whereRaw('LOWER(name) = ?', [mb_strtolower($projectInput, 'UTF-8')])
                ->value('id');
        }

        $missing = [];
        if ($name === '') {
            $missing[] = 'name';
        }
        if ($phone === '') {
            $missing[] = 'phone';
        }
        if ($sourceInput === '') {
            $missing[] = 'source';
        }
        if ($isGeneral && ! $itemId) {
            $missing[] = 'item';
        }
        if (! $isGeneral && ! $projectId) {
            $missing[] = 'project';
        }

        $payload = array_filter([
            'name' => $name !== '' ? $name : null,
            'phone' => $phone !== '' ? $phone : null,
            'email' => $email !== '' ? $email : null,
            'company' => isset($args['company']) ? trim((string) $args['company']) : null,
            'campaign' => isset($args['campaign']) ? trim((string) $args['campaign']) : null,
            'country' => isset($args['country']) ? trim((string) $args['country']) : null,
            'phone_country' => isset($args['phone_country']) ? trim((string) $args['phone_country']) : null,
            'assigned_to' => isset($args['assigned_to']) ? (int) $args['assigned_to'] : null,
            'stage_id' => isset($args['stage_id']) ? (int) $args['stage_id'] : null,
            'estimated_value' => isset($args['estimated_value']) ? $args['estimated_value'] : null,
            'item_id' => $itemId ?: null,
            'project_id' => $projectId ?: null,
        ], fn ($value) => $value !== null && $value !== '');

        if ($sourceInput !== '') {
            $resolvedSource = TenantSourceLookup::resolveName($tenantId, $sourceInput);
            if (! $resolvedSource) {
                return [
                    'ok' => false,
                    'state' => 'rejected',
                    'resource' => 'lead',
                    'requires_confirmation' => false,
                    'missing_fields' => [],
                    'message' => 'Selected source does not exist for this tenant.',
                    'payload' => $payload,
                    'errors' => [
                        'source' => ['Selected source does not exist for this tenant.'],
                    ],
                    'ui_actions' => [],
                ];
            }

            $payload['source'] = $resolvedSource;
        }

        if ($isGeneral && ($itemInput !== '' || $itemId)) {
            if (! $itemId) {
                return [
                    'ok' => false,
                    'state' => 'rejected',
                    'resource' => 'lead',
                    'requires_confirmation' => false,
                    'missing_fields' => [],
                    'message' => 'Selected item does not exist for this tenant.',
                    'payload' => $payload,
                    'errors' => [
                        'item' => ['Selected item does not exist for this tenant.'],
                    ],
                    'ui_actions' => [],
                ];
            }

            $validItemId = Item::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $itemId)
                ->value('id');

            if (! $validItemId) {
                return [
                    'ok' => false,
                    'state' => 'rejected',
                    'resource' => 'lead',
                    'requires_confirmation' => false,
                    'missing_fields' => [],
                    'message' => 'Selected item does not exist for this tenant.',
                    'payload' => $payload,
                    'errors' => [
                        'item_id' => ['Selected item does not exist for this tenant.'],
                    ],
                    'ui_actions' => [],
                ];
            }
        }

        if (! $isGeneral && ($projectInput !== '' || $projectId)) {
            if (! $projectId) {
                return [
                    'ok' => false,
                    'state' => 'rejected',
                    'resource' => 'lead',
                    'requires_confirmation' => false,
                    'missing_fields' => [],
                    'message' => 'Selected project does not exist for this tenant.',
                    'payload' => $payload,
                    'errors' => [
                        'project' => ['Selected project does not exist for this tenant.'],
                    ],
                    'ui_actions' => [],
                ];
            }

            $validProjectId = Project::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $projectId)
                ->value('id');

            if (! $validProjectId) {
                return [
                    'ok' => false,
                    'state' => 'rejected',
                    'resource' => 'lead',
                    'requires_confirmation' => false,
                    'missing_fields' => [],
                    'message' => 'Selected project does not exist for this tenant.',
                    'payload' => $payload,
                    'errors' => [
                        'project_id' => ['Selected project does not exist for this tenant.'],
                    ],
                    'ui_actions' => [],
                ];
            }
        }

        if ($missing !== []) {
            return [
                'ok' => true,
                'state' => 'needs_input',
                'resource' => 'lead',
                'requires_confirmation' => false,
                'missing_fields' => $missing,
                'message' => 'I need '.implode(' and ', $missing).' before I can draft the lead.',
                'payload' => $payload,
                'ui_actions' => [],
            ];
        }

        return [
            'ok' => true,
            'state' => 'awaiting_confirmation',
            'resource' => 'lead',
            'requires_confirmation' => true,
            'missing_fields' => [],
            'message' => $this->buildDraftMessage($payload),
            'payload' => $payload,
            'summary' => [
                'name' => $payload['name'] ?? null,
                'phone' => $payload['phone'] ?? null,
                'email' => $payload['email'] ?? null,
                'source' => $payload['source'] ?? null,
                'item_id' => $payload['item_id'] ?? null,
                'project_id' => $payload['project_id'] ?? null,
                'assigned_to' => $payload['assigned_to'] ?? null,
            ],
            'ui_actions' => [
                [
                    'type' => 'confirm_action',
                    'action' => 'create_lead',
                    'payload' => $payload,
                    'label' => 'Create lead',
                ],
            ],
        ];
    }

    protected function buildDraftMessage(array $payload): string
    {
        $parts = ['Lead draft ready'];
        $parts[] = 'for '.($payload['name'] ?? 'new lead');

        if (! empty($payload['phone'])) {
            $parts[] = 'phone '.$payload['phone'];
        }

        if (! empty($payload['source'])) {
            $parts[] = 'source '.$payload['source'];
        }

        return implode(' ', $parts).'. Confirm to create it.';
    }
}
