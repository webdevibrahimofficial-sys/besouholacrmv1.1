<?php

namespace App\Services\AiCopilot;

use App\Models\Item;
use App\Models\Project;
use App\Models\Tenant;
use App\Models\User;
use App\Support\TenantSourceLookup;
use Illuminate\Support\Facades\DB;

class CopilotLeadDraftService
{
    private const OPTIONAL_STEPS = ['secondary_phone', 'estimated_value', 'assigned_to'];

    public function build(User $user, array $args): array
    {
        $tenant = Tenant::find($user->tenant_id);
        $companyType = strtolower(trim((string) ($tenant?->company_type ?? 'general')));
        $isGeneral = $companyType === 'general';
        $tenantId = (int) ($user->tenant_id ?? 0);

        $name = trim((string) ($args['name'] ?? ''));
        $phone = trim((string) ($args['phone'] ?? ''));
        $email = trim((string) ($args['email'] ?? ''));
        $sourceInput = trim((string) ($args['source'] ?? ''));
        $itemInput = trim((string) ($args['item'] ?? ''));
        $projectInput = trim((string) ($args['project'] ?? ''));
        $itemId = isset($args['item_id']) ? (int) $args['item_id'] : null;
        $projectId = isset($args['project_id']) ? (int) $args['project_id'] : null;
        $assignedToId = $this->resolveAssigneeId($tenantId, $args);

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

        $payload = array_filter([
            'name' => $name !== '' ? $name : null,
            'phone' => $phone !== '' ? $phone : null,
            'email' => $email !== '' ? $email : null,
            'company' => isset($args['company']) ? trim((string) $args['company']) : null,
            'campaign' => isset($args['campaign']) ? trim((string) $args['campaign']) : null,
            'country' => isset($args['country']) ? trim((string) $args['country']) : null,
            'phone_country' => isset($args['phone_country']) ? trim((string) $args['phone_country']) : null,
            'assigned_to' => $assignedToId ?: null,
            'stage_id' => isset($args['stage_id']) ? (int) $args['stage_id'] : null,
            'estimated_value' => isset($args['estimated_value']) ? $args['estimated_value'] : null,
            'secondary_phone' => isset($args['secondary_phone']) ? trim((string) $args['secondary_phone']) : null,
            'item_id' => $itemId ?: null,
            'project_id' => $projectId ?: null,
        ], fn ($value) => $value !== null && $value !== '');

        $missing = [];
        if (($payload['name'] ?? '') === '') {
            $missing[] = 'name';
        }
        if (($payload['phone'] ?? '') === '') {
            $missing[] = 'phone';
        }
        if ($sourceInput === '' && empty($payload['source'])) {
            $missing[] = 'source';
        }
        if ($isGeneral && empty($payload['item_id'])) {
            $missing[] = 'item';
        }
        if (! $isGeneral && empty($payload['project_id'])) {
            $missing[] = 'project';
        }

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
                    'errors' => ['source' => ['Selected source does not exist for this tenant.']],
                    'ui_actions' => [$this->buildLeadFormAction($tenantId, $companyType, $payload, ['source'])],
                ];
            }

            $payload['source'] = $resolvedSource;
        }

        if ($isGeneral && ($itemInput !== '' || $itemId)) {
            if (! $itemId || ! Item::query()->where('tenant_id', $tenantId)->where('id', $itemId)->exists()) {
                return [
                    'ok' => false,
                    'state' => 'rejected',
                    'resource' => 'lead',
                    'requires_confirmation' => false,
                    'missing_fields' => [],
                    'message' => 'Selected item does not exist for this tenant.',
                    'payload' => $payload,
                    'errors' => ['item' => ['Selected item does not exist for this tenant.']],
                    'ui_actions' => [$this->buildLeadFormAction($tenantId, $companyType, $payload, ['item'])],
                ];
            }
        }

        if (! $isGeneral && ($projectInput !== '' || $projectId)) {
            if (! $projectId || ! Project::query()->where('tenant_id', $tenantId)->where('id', $projectId)->exists()) {
                return [
                    'ok' => false,
                    'state' => 'rejected',
                    'resource' => 'lead',
                    'requires_confirmation' => false,
                    'missing_fields' => [],
                    'message' => 'Selected project does not exist for this tenant.',
                    'payload' => $payload,
                    'errors' => ['project' => ['Selected project does not exist for this tenant.']],
                    'ui_actions' => [$this->buildLeadFormAction($tenantId, $companyType, $payload, ['project'])],
                ];
            }
        }

        if (! empty($payload['assigned_to'])) {
            $validAssignee = User::query()
                ->where('tenant_id', $tenantId)
                ->where('id', (int) $payload['assigned_to'])
                ->exists();

            if (! $validAssignee) {
                return [
                    'ok' => false,
                    'state' => 'rejected',
                    'resource' => 'lead',
                    'requires_confirmation' => false,
                    'missing_fields' => [],
                    'message' => 'Selected assignee does not exist for this tenant.',
                    'payload' => $payload,
                    'errors' => ['assigned_to' => ['Selected assignee does not exist for this tenant.']],
                    'ui_actions' => [$this->buildOptionalStepResult($tenantId, $payload, 'assigned_to')['ui_actions'][0] ?? []],
                ];
            }
        }

        $optionalFlow = (string) ($args['copilot_optional_flow'] ?? '');
        $optionalStep = (string) ($args['copilot_optional_step'] ?? '');
        $optionalSkip = (bool) ($args['copilot_optional_skip'] ?? false);

        if ($missing !== []) {
            return [
                'ok' => true,
                'state' => 'needs_input',
                'resource' => 'lead',
                'requires_confirmation' => false,
                'missing_fields' => $missing,
                'message' => 'I need '.implode(' and ', $missing).' before I can draft the lead.',
                'payload' => $payload,
                'ui_actions' => [$this->buildLeadFormAction($tenantId, $companyType, $payload, $missing)],
            ];
        }

        if ($optionalFlow === 'start') {
            return $this->buildOptionalStepResult($tenantId, $payload, self::OPTIONAL_STEPS[0]);
        }

        if ($optionalFlow === 'continue' && in_array($optionalStep, self::OPTIONAL_STEPS, true)) {
            if (! $optionalSkip) {
                $payload = $this->applyOptionalStepPayload($tenantId, $payload, $optionalStep, $args);
            }

            $nextStep = $this->nextOptionalStep($optionalStep);
            if ($nextStep) {
                return $this->buildOptionalStepResult($tenantId, $payload, $nextStep);
            }

            return $this->buildAwaitingConfirmationResult($tenantId, $companyType, $payload, 'Lead draft updated with the extra details. Confirm to create it.');
        }

        return $this->buildAwaitingConfirmationResult($tenantId, $companyType, $payload);
    }

    protected function buildAwaitingConfirmationResult(int $tenantId, string $companyType, array $payload, ?string $message = null): array
    {
        return [
            'ok' => true,
            'state' => 'awaiting_confirmation',
            'resource' => 'lead',
            'requires_confirmation' => true,
            'missing_fields' => [],
            'message' => $message ?: $this->buildDraftMessage($payload, $companyType),
            'payload' => $payload,
            'summary' => [
                'name' => $payload['name'] ?? null,
                'phone' => $payload['phone'] ?? null,
                'email' => $payload['email'] ?? null,
                'source' => $payload['source'] ?? null,
                'item_id' => $payload['item_id'] ?? null,
                'project_id' => $payload['project_id'] ?? null,
                'assigned_to' => $payload['assigned_to'] ?? null,
                'secondary_phone' => $payload['secondary_phone'] ?? null,
                'estimated_value' => $payload['estimated_value'] ?? null,
            ],
            'ui_actions' => [
                [
                    'type' => 'confirm_action',
                    'action' => 'create_lead',
                    'payload' => $payload,
                    'label' => 'Create lead',
                ],
                [
                    'type' => 'prompt_message',
                    'message' => '__copilot_optional_start__',
                    'display_text' => 'Add more details',
                    'label' => 'Add more details',
                ],
            ],
        ];
    }

    protected function buildOptionalStepResult(int $tenantId, array $payload, string $step): array
    {
        $question = match ($step) {
            'secondary_phone' => 'Do you want to add another phone number for this lead? You can enter it now or skip.',
            'estimated_value' => 'Do you want to add the expected revenue for this lead? You can enter a number or skip.',
            'assigned_to' => 'Do you want to assign this lead to a sales user now? Choose a user or skip.',
            default => 'Do you want to add another detail?',
        };

        return [
            'ok' => true,
            'state' => 'awaiting_optional_input',
            'resource' => 'lead',
            'requires_confirmation' => false,
            'missing_fields' => [],
            'optional_step' => $step,
            'message' => $question,
            'payload' => $payload,
            'ui_actions' => [
                $this->buildOptionalStepFormAction($tenantId, $payload, $step),
                [
                    'type' => 'prompt_message',
                    'message' => '__copilot_skip_optional__',
                    'display_text' => 'Skip',
                    'label' => 'Skip',
                ],
            ],
        ];
    }

    protected function buildOptionalStepFormAction(int $tenantId, array $payload, string $step): array
    {
        $fields = match ($step) {
            'secondary_phone' => [[
                'name' => 'secondary_phone',
                'label' => 'Other Phone',
                'type' => 'text',
                'required' => false,
                'value' => (string) ($payload['secondary_phone'] ?? ''),
            ]],
            'estimated_value' => [[
                'name' => 'estimated_value',
                'label' => 'Expected Revenue',
                'type' => 'text',
                'required' => false,
                'value' => (string) ($payload['estimated_value'] ?? ''),
            ]],
            'assigned_to' => [[
                'name' => 'assigned_to',
                'label' => 'Assign To',
                'type' => 'select',
                'required' => false,
                'value' => (string) ($payload['assigned_to'] ?? ''),
                'options' => User::query()
                    ->where('tenant_id', $tenantId)
                    ->where('status', 'active')
                    ->orderBy('name')
                    ->limit(25)
                    ->get(['id', 'name'])
                    ->map(fn ($user) => ['label' => (string) $user->name, 'value' => (string) $user->id])
                    ->values()
                    ->all(),
            ]],
            default => [],
        };

        return [
            'type' => 'form',
            'action' => 'send_message',
            'label' => 'Optional detail',
            'submit_label' => 'Continue',
            'message_prefix' => '__copilot_optional_continue__',
            'optional_step' => $step,
            'fields' => $fields,
        ];
    }

    protected function applyOptionalStepPayload(int $tenantId, array $payload, string $step, array $args): array
    {
        return match ($step) {
            'secondary_phone' => array_merge($payload, array_filter([
                'secondary_phone' => trim((string) ($args['secondary_phone'] ?? '')) ?: null,
            ], fn ($value) => $value !== null && $value !== '')),
            'estimated_value' => array_merge($payload, array_filter([
                'estimated_value' => trim((string) ($args['estimated_value'] ?? '')) ?: null,
            ], fn ($value) => $value !== null && $value !== '')),
            'assigned_to' => array_merge($payload, array_filter([
                'assigned_to' => $this->resolveAssigneeId($tenantId, array_merge($payload, $args)),
            ], fn ($value) => $value !== null && $value !== '')),
            default => $payload,
        };
    }

    protected function resolveAssigneeId(int $tenantId, array $args): ?int
    {
        $rawAssignedTo = $args['assigned_to'] ?? null;
        $assignedToName = trim((string) ($args['assigned_to_name'] ?? ''));

        if (is_string($rawAssignedTo)) {
            $rawAssignedTo = trim($rawAssignedTo);
            if ($rawAssignedTo !== '' && ! preg_match('/^\d+$/', $rawAssignedTo) && $assignedToName === '') {
                $assignedToName = $rawAssignedTo;
                $rawAssignedTo = null;
            }
        }

        if ($rawAssignedTo !== null && $rawAssignedTo !== '' && (int) $rawAssignedTo > 0) {
            $candidateId = (int) $rawAssignedTo;
            $exists = User::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $candidateId)
                ->exists();

            return $exists ? $candidateId : null;
        }

        if ($assignedToName === '' || $tenantId <= 0) {
            return null;
        }

        $resolvedId = User::query()
            ->where('tenant_id', $tenantId)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($assignedToName, 'UTF-8')])
            ->value('id');

        return $resolvedId ? (int) $resolvedId : null;
    }

    protected function nextOptionalStep(string $step): ?string
    {
        $index = array_search($step, self::OPTIONAL_STEPS, true);
        if ($index === false) {
            return null;
        }

        return self::OPTIONAL_STEPS[$index + 1] ?? null;
    }

    protected function buildDraftMessage(array $payload, string $companyType): string
    {
        $parts = ['Lead draft ready'];
        $parts[] = 'for '.($payload['name'] ?? 'new lead');

        if (! empty($payload['phone'])) {
            $parts[] = 'phone '.$payload['phone'];
        }

        if (! empty($payload['source'])) {
            $parts[] = 'source '.$payload['source'];
        }

        if (($payload['item_id'] ?? null) && $companyType === 'general') {
            $parts[] = 'item #'.$payload['item_id'];
        }

        if (($payload['project_id'] ?? null) && $companyType !== 'general') {
            $parts[] = 'project #'.$payload['project_id'];
        }

        return implode(' ', $parts).'. Confirm to create it.';
    }

    protected function buildLeadFormAction(int $tenantId, string $companyType, array $payload, array $missingFields): array
    {
        $isGeneral = $companyType === 'general';
        $assetField = $isGeneral ? 'item' : 'project';
        $assetLabel = $isGeneral ? 'Item' : 'Project';
        $assetOptions = $isGeneral
            ? Item::query()->where('tenant_id', $tenantId)->orderBy('name')->limit(25)->get(['id', 'name'])
            : Project::query()->where('tenant_id', $tenantId)->orderBy('name')->limit(25)->get(['id', 'name']);

        $sourceOptions = DB::table('sources')
            ->where('tenant_id', $tenantId)
            ->where('is_active', true)
            ->orderBy('name')
            ->limit(25)
            ->get(['name'])
            ->map(fn ($source) => ['label' => (string) $source->name, 'value' => (string) $source->name])
            ->values()
            ->all();

        $entityOptions = collect($assetOptions)
            ->map(fn ($entity) => ['label' => (string) $entity->name, 'value' => (string) $entity->id])
            ->values()
            ->all();

        return [
            'type' => 'form',
            'action' => 'send_message',
            'label' => 'Complete lead data',
            'submit_label' => 'Continue',
            'message_prefix' => '__copilot_optional_continue__',
            'missing_fields' => array_values($missingFields),
            'fields' => [
                ['name' => 'name', 'label' => 'Name', 'type' => 'text', 'required' => true, 'value' => (string) ($payload['name'] ?? '')],
                ['name' => 'phone', 'label' => 'Phone', 'type' => 'text', 'required' => true, 'value' => (string) ($payload['phone'] ?? '')],
                ['name' => 'source', 'label' => 'Source', 'type' => 'select', 'required' => true, 'value' => (string) ($payload['source'] ?? ''), 'options' => $sourceOptions],
                ['name' => $assetField.'_id', 'label' => $assetLabel, 'type' => 'select', 'required' => true, 'value' => (string) ($payload[$assetField.'_id'] ?? ''), 'options' => $entityOptions],
                ['name' => 'email', 'label' => 'Email', 'type' => 'email', 'required' => false, 'value' => (string) ($payload['email'] ?? '')],
            ],
        ];
    }
}

