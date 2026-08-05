<?php

namespace App\Services;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\User;
use App\Traits\UserHierarchyTrait;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class MeetingActionService
{
    use UserHierarchyTrait;

    public function validateNextActionDate(array $payload): void
    {
        $date = trim((string) ($payload['date'] ?? ''));
        $time = trim((string) ($payload['time'] ?? ''));

        if ($date !== '' && $time !== '') {
            return;
        }

        throw ValidationException::withMessages([
            'date' => ['يجب تحديد موعد المقابلة القادمة (Next Action Date) عند تسجيل أي إجراء في مرحلة Meeting.'],
            'time' => ['يجب تحديد موعد المقابلة القادمة (Next Action Date) عند تسجيل أي إجراء في مرحلة Meeting.'],
        ]);
    }

    public function normalizeMeetingStatus($status, $doneMeeting = null): string
    {
        $value = strtolower(trim((string) ($status ?? '')));
        if ($value === 'done') {
            return 'done';
        }
        if (in_array($value, ['no_show', 'no show', 'noshow', 'missed'], true)) {
            return 'no_show';
        }
        if (in_array($value, ['cancelled', 'canceled', 'cancel'], true)) {
            return 'cancelled';
        }
        if (in_array($value, ['scheduled', 'schedule', 'arranged'], true)) {
            return 'scheduled';
        }

        $doneMeetingValue = $doneMeeting;
        if (is_string($doneMeetingValue)) {
            $doneMeetingValue = strtolower(trim($doneMeetingValue));
        }

        if ($doneMeetingValue === true || $doneMeetingValue === 1 || $doneMeetingValue === '1' || $doneMeetingValue === 'true') {
            return 'done';
        }

        return 'scheduled';
    }

    public function applyMeetingStatus(array $details, string $status): array
    {
        $nowIso = now()->toISOString();

        if (empty($details['arranged_at'])) {
            $details['arranged_at'] = $nowIso;
        }

        if ($status === 'scheduled' && empty($details['scheduled_at'])) {
            $details['scheduled_at'] = $nowIso;
        }

        if ($status === 'done') {
            if (empty($details['done_at'])) {
                $details['done_at'] = $nowIso;
            }
            $details['doneMeeting'] = 'true';
        }

        if ($status === 'no_show') {
            if (empty($details['missed_at'])) {
                $details['missed_at'] = $nowIso;
            }
            $details['doneMeeting'] = 'false';
        }

        $details['meeting_status'] = $status;
        $details['meeting_status_changed_at'] = $nowIso;

        return $details;
    }

    public function recordAction(Lead $lead, User $actor, array $details, ?string $description, ?int $stageId, ?string $nextActionType): LeadAction
    {
        $status = $this->normalizeMeetingStatus($details['meeting_status'] ?? null, $details['doneMeeting'] ?? null);
        $details = $this->applyMeetingStatus($details, $status);

        $leadAction = LeadAction::create([
            'lead_id' => $lead->id,
            'user_id' => $actor->id,
            'action_type' => $details['type'] ?? 'meeting',
            'description' => $description,
            'stage_id_at_creation' => $stageId,
            'next_action_type' => $nextActionType,
            'details' => $details,
            'tenant_id' => $lead->tenant_id,
        ]);

        $this->writeMeetingAudit($leadAction, null, $status, $actor->id);

        return $leadAction;
    }

    public function getLeadMeetingCounts(int $leadId): array
    {
        $meetingRows = LeadAction::query()
            ->where('lead_id', $leadId)
            ->where(function ($query) {
                $query->where('action_type', 'meeting')
                    ->orWhere('next_action_type', 'meeting');
            });

        return [
            'scheduled' => (clone $meetingRows)->count(),
            'done' => (clone $meetingRows)->where('details->meeting_status', 'done')->count(),
            'missed' => (clone $meetingRows)->where('details->meeting_status', 'no_show')->count(),
        ];
    }

    public function getSalespersonMeetingReport(array $userIds): array
    {
        $rows = LeadAction::query()
            ->selectRaw('user_id')
            ->selectRaw('COUNT(*) as scheduled')
            ->selectRaw('COUNT(DISTINCT lead_id) as distinct_leads')
            ->selectRaw("SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(details, '$.meeting_status')) = 'done' THEN 1 ELSE 0 END) as done")
            ->selectRaw("SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(details, '$.meeting_status')) = 'no_show' THEN 1 ELSE 0 END) as missed")
            ->where(function ($query) {
                $query->where('action_type', 'meeting')
                    ->orWhere('next_action_type', 'meeting');
            })
            ->when(!empty($userIds), fn ($query) => $query->whereIn('user_id', $userIds))
            ->groupBy('user_id')
            ->get();

        return $rows->map(function ($row) {
            $scheduled = (int) ($row->scheduled ?? 0);
            $done = (int) ($row->done ?? 0);
            $missed = (int) ($row->missed ?? 0);

            return [
                'user_id' => (int) $row->user_id,
                'distinct_leads' => (int) ($row->distinct_leads ?? 0),
                'scheduled' => $scheduled,
                'done' => $done,
                'missed' => $missed,
                'success_rate' => $scheduled > 0 ? round(($done / $scheduled) * 100, 2) : 0.0,
                'no_show_rate' => $scheduled > 0 ? round(($missed / $scheduled) * 100, 2) : 0.0,
            ];
        })->all();
    }

    public function resolveViewableUserIds(User $user, ?int $managerId = null): array
    {
        $ids = $this->getViewableUserIds($user, $managerId);

        if ($ids === null) {
            return [];
        }

        return array_values(array_unique(array_map('intval', $ids)));
    }

    private function tenantConnection()
    {
        return DB::connection(config('multitenancy.tenant_database_connection_name'));
    }

    private function tenantSchema()
    {
        return Schema::connection(config('multitenancy.tenant_database_connection_name'));
    }

    public function writeMeetingAudit(LeadAction $leadAction, ?string $fromStatus, string $toStatus, ?int $userId): void
    {
        try {
            if (!$this->tenantSchema()->hasTable('lead_action_status_audits')) {
                return;
            }

            $lead = $leadAction->lead ?? Lead::find($leadAction->lead_id);

            $this->tenantConnection()->table('lead_action_status_audits')->insert([
                'tenant_id' => $lead?->tenant_id,
                'lead_action_id' => $leadAction->id,
                'lead_id' => $leadAction->lead_id,
                'from_status' => $fromStatus,
                'to_status' => $toStatus,
                'changed_by' => $userId,
                'changed_at' => now(),
                'meta' => json_encode([
                    'action_type' => $leadAction->action_type,
                ]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (\Throwable $e) {
        }
    }
}
