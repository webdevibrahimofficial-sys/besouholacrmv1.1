<?php

namespace App\Services\AiCopilot;

use App\Models\Lead;
use App\Models\User;
use App\Traits\UserHierarchyTrait;
use Carbon\Carbon;
use Illuminate\Support\Facades\Schema;

class CopilotLeadActionDraftService
{
    use UserHierarchyTrait;

    public function build(User $user, array $args): array
    {
        $leadId = (int) ($args['lead_id'] ?? 0);
        $type = $this->normalizeActionType((string) ($args['type'] ?? $args['action_type'] ?? ''));
        $missing = [];

        if ($leadId <= 0) {
            $missing[] = 'lead_id';
        }

        if ($type === '') {
            $missing[] = 'type';
        }

        if ($missing !== []) {
            return [
                'ok' => true,
                'state' => 'needs_input',
                'resource' => 'lead_action',
                'requires_confirmation' => false,
                'missing_fields' => $missing,
                'payload' => [
                    'lead_id' => $leadId > 0 ? $leadId : null,
                    'type' => $type !== '' ? $type : null,
                ],
                'message' => 'I need '.implode(' and ', $missing).' before I can draft the lead action.',
                'ui_actions' => [],
            ];
        }

        $lead = $this->findVisibleLead($user, $leadId);
        if (! $lead) {
            return [
                'ok' => false,
                'state' => 'rejected',
                'resource' => 'lead_action',
                'message' => 'Lead not found or not visible to you.',
                'missing_fields' => [],
                'requires_confirmation' => false,
                'ui_actions' => [],
            ];
        }

        $status = $this->normalizeStatus((string) ($args['status'] ?? ''), $type);
        $date = $this->normalizeDate($args['date'] ?? $args['due_date'] ?? null);
        $time = $this->normalizeTime($args['time'] ?? null);
        $description = trim((string) ($args['description'] ?? ''));

        if ($description === '' && $type === 'follow_up') {
            $description = 'Follow up with '.($lead->name ?: ('lead #'.$lead->id));
        }

        $payload = array_filter([
            'lead_id' => $lead->id,
            'type' => $type,
            'status' => $status,
            'date' => $date,
            'time' => $time,
            'description' => $description !== '' ? $description : null,
            'stage_id' => isset($args['stage_id']) ? (int) $args['stage_id'] : null,
            'next_action_type' => isset($args['next_action_type'])
                ? $this->normalizeActionType((string) $args['next_action_type'])
                : null,
        ], fn ($value) => $value !== null && $value !== '');

        return [
            'ok' => true,
            'state' => 'awaiting_confirmation',
            'resource' => 'lead_action',
            'requires_confirmation' => true,
            'missing_fields' => [],
            'message' => $this->buildDraftMessage($lead, $payload),
            'payload' => $payload,
            'summary' => [
                'lead_id' => $lead->id,
                'lead_name' => $lead->name,
                'type' => $type,
                'status' => $status,
                'date' => $date,
                'time' => $time,
                'description' => $description !== '' ? $description : null,
            ],
            'ui_actions' => [
                [
                    'type' => 'confirm_action',
                    'action' => 'create_lead_action',
                    'payload' => $payload,
                    'label' => 'Create lead action',
                ],
            ],
        ];
    }

    protected function findVisibleLead(User $user, int $leadId): ?Lead
    {
        if ($leadId <= 0 || ! Schema::hasTable('leads')) {
            return null;
        }

        $query = Lead::query()->where('id', $leadId);
        $viewableIds = $this->getViewableUserIds($user);
        if ($viewableIds !== null) {
            $query->where(function ($q) use ($viewableIds, $user) {
                $q->whereIn('assigned_to', $viewableIds)
                    ->orWhere('manager_id', $user->id)
                    ->orWhere('assigned_to', $user->id);
            });
        }

        return $query->first();
    }

    protected function normalizeActionType(string $value): string
    {
        $value = strtolower(trim($value));

        return match ($value) {
            'followup', 'follow-up', 'follow up', 'follow_up', 'متابعة' => 'follow_up',
            'meeting', 'meeting_arrange', 'arrange_meeting', 'اجتماع' => 'meeting',
            'comment', 'تعليق' => 'comment',
            'note', 'ملاحظة' => 'note',
            'internal_comment', 'internal comment' => 'internal_comment',
            default => $value,
        };
    }

    protected function normalizeStatus(string $value, string $type): string
    {
        $value = strtolower(trim($value));
        if ($value !== '') {
            return $value;
        }

        return in_array($type, ['comment', 'note', 'internal_comment'], true)
            ? 'done'
            : 'scheduled';
    }

    protected function normalizeDate(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $raw = trim((string) $value);
        $lower = strtolower($raw);

        if (in_array($lower, ['today', 'اليوم'], true)) {
            return now()->toDateString();
        }

        if (in_array($lower, ['tomorrow', 'بكرة', 'غدا', 'غداً'], true)) {
            return now()->addDay()->toDateString();
        }

        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $raw)) {
            return $raw;
        }

        if (preg_match('/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/', $raw, $m)) {
            $day = (int) $m[1];
            $month = (int) $m[2];
            $year = (int) $m[3];

            if ($day <= 12 && $month > 12) {
                [$day, $month] = [$month, $day];
            }

            return sprintf('%04d-%02d-%02d', $year, $month, $day);
        }

        try {
            return Carbon::parse($raw)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    protected function normalizeTime(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $raw = trim((string) $value);
        try {
            return Carbon::parse($raw)->format('H:i');
        } catch (\Throwable) {
            return $raw;
        }
    }

    protected function buildDraftMessage(Lead $lead, array $payload): string
    {
        $parts = ['Lead action draft ready'];
        $parts[] = 'for '.($lead->name ?: ('lead #'.$lead->id));
        $parts[] = 'type '.str_replace('_', ' ', (string) ($payload['type'] ?? 'action'));

        if (! empty($payload['date'])) {
            $parts[] = 'on '.$payload['date'];
        }

        if (! empty($payload['time'])) {
            $parts[] = 'at '.$payload['time'];
        }

        return implode(' ', $parts).'. Confirm to create it.';
    }
}

