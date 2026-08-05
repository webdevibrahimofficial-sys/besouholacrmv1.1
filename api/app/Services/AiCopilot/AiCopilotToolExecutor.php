<?php

namespace App\Services\AiCopilot;

use App\Models\Export;
use App\Models\Lead;
use App\Models\Task;
use App\Models\User;
use App\Traits\UserHierarchyTrait;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class AiCopilotToolExecutor
{
    use UserHierarchyTrait;

    public function __construct(
        private readonly AiSystemCatalog $catalog,
        private readonly CopilotLeadDraftService $leadDrafts,
        private readonly CopilotLeadCreationAdapter $leadCreation,
        private readonly CopilotLeadActionDraftService $leadActionDrafts,
        private readonly CopilotLeadActionCreationAdapter $leadActionCreation
    ) {
    }

    public function definitions(): array
    {
        return [
            [
                'name' => 'list_capabilities',
                'description' => 'List Besouhola Copilot capabilities and reports available to the current user.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => (object) [],
                ],
            ],
            [
                'name' => 'explain_feature',
                'description' => 'Explain a CRM feature, report, or workflow the user asked about.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'topic' => [
                            'type' => 'string',
                            'description' => 'Feature or report topic to explain.',
                        ],
                    ],
                    'required' => ['topic'],
                ],
            ],
            [
                'name' => 'build_report_filters',
                'description' => 'Build normalized report filters from natural language.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'date_from' => ['type' => 'string'],
                        'date_to' => ['type' => 'string'],
                        'assigned_to' => ['type' => 'string'],
                        'stage' => ['type' => 'string'],
                        'workflow_key' => ['type' => 'string'],
                    ],
                ],
            ],
            [
                'name' => 'navigate_report',
                'description' => 'Open a report page with optional filters when the user has show permission.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'report' => ['type' => 'string'],
                        'date_from' => ['type' => 'string'],
                        'date_to' => ['type' => 'string'],
                        'assigned_to' => ['type' => 'string'],
                        'stage' => ['type' => 'string'],
                    ],
                    'required' => ['report'],
                ],
            ],
            [
                'name' => 'export_report',
                'description' => 'Prepare an export/download for a report when the user has export permission.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'report' => ['type' => 'string'],
                        'format' => ['type' => 'string'],
                        'date_from' => ['type' => 'string'],
                        'date_to' => ['type' => 'string'],
                        'assigned_to' => ['type' => 'string'],
                        'stage' => ['type' => 'string'],
                    ],
                    'required' => ['report'],
                ],
            ],
            [
                'name' => 'list_delayed_leads',
                'description' => 'List delayed leads visible to the current user.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'workflow_key' => ['type' => 'string'],
                        'assigned_to' => ['type' => 'integer'],
                        'limit' => ['type' => 'integer'],
                    ],
                ],
            ],
            [
                'name' => 'create_lead_draft',
                'description' => 'Draft a lead using the existing lead creation flow, then require confirmation before creation.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'name' => ['type' => 'string'],
                        'phone' => ['type' => 'string'],
                        'email' => ['type' => 'string'],
                        'source' => ['type' => 'string'],
                        'company' => ['type' => 'string'],
                        'campaign' => ['type' => 'string'],
                        'country' => ['type' => 'string'],
                        'phone_country' => ['type' => 'string'],
                        'assigned_to' => ['type' => 'integer'],
                        'stage_id' => ['type' => 'integer'],
                    ],
                ],
            ],
            [
                'name' => 'create_lead_action_draft',
                'description' => 'Draft a lead action using the same lead action rules, then require confirmation before creation.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'lead_id' => ['type' => 'integer'],
                        'type' => ['type' => 'string'],
                        'status' => ['type' => 'string'],
                        'date' => ['type' => 'string'],
                        'time' => ['type' => 'string'],
                        'description' => ['type' => 'string'],
                        'stage_id' => ['type' => 'integer'],
                        'next_action_type' => ['type' => 'string'],
                    ],
                ],
            ],
            [
                'name' => 'create_task_for_lead',
                'description' => 'Draft a task for a lead. Requires user confirmation before creation.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'lead_id' => ['type' => 'integer'],
                        'title' => ['type' => 'string'],
                        'description' => ['type' => 'string'],
                        'priority' => ['type' => 'string'],
                        'due_date' => ['type' => 'string'],
                        'assigned_to' => ['type' => 'integer'],
                    ],
                    'required' => ['lead_id', 'title'],
                ],
            ],
        ];
    }

    public function execute(User $user, string $name, array $args = []): array
    {
        return match ($name) {
            'list_capabilities' => $this->listCapabilities($user),
            'explain_feature' => $this->explainFeature($user, (string) ($args['topic'] ?? '')),
            'build_report_filters' => $this->buildReportFilters($args),
            'navigate_report' => $this->navigateReport($user, $args),
            'export_report' => $this->exportReport($user, $args),
            'list_delayed_leads' => $this->listDelayedLeads($user, $args),
            'create_lead_draft' => $this->leadDrafts->build($user, $args),
            'create_lead_action_draft' => $this->leadActionDrafts->build($user, $args),
            'create_task_for_lead' => $this->draftCreateTask($user, $args),
            default => [
                'ok' => false,
                'message' => "Unknown tool: {$name}",
            ],
        };
    }

    public function confirm(User $user, string $action, array $payload): array
    {
        return match ($action) {
            'create_lead' => $this->leadCreation->execute($user, $payload),
            'create_lead_action' => $this->leadActionCreation->execute($user, $payload),
            'create_task_for_lead' => $this->createTaskForLead($user, $payload),
            default => ['ok' => false, 'message' => 'Unsupported confirmation action.'],
        };
    }

    protected function listCapabilities(User $user): array
    {
        $catalog = $this->catalog->forUser($user);

        return [
            'ok' => true,
            'catalog' => $catalog,
            'summary' => 'Besouhola Copilot can explain the system, open/export permitted reports, list delayed leads, and draft leads, lead actions, or tasks.',
        ];
    }

    protected function explainFeature(User $user, string $topic): array
    {
        $report = $this->catalog->findReport($topic);
        if ($report) {
            $canShow = $this->catalog->canShowReport($user, $report['permission']);
            $canExport = $this->catalog->canExportReport($user, $report['permission']);

            return [
                'ok' => true,
                'topic' => $report['name'],
                'explanation' => $report['description'],
                'path' => $report['path'],
                'can_show' => $canShow,
                'can_export' => $canExport,
                'filters' => $report['filters'],
            ];
        }

        $catalog = $this->catalog->forUser($user);

        return [
            'ok' => true,
            'topic' => $topic !== '' ? $topic : 'Besouhola Copilot',
            'explanation' => 'Besouhola Copilot helps with CRM navigation, permission-aware reporting, delayed leads, lead drafting, lead action drafting, and task drafting.',
            'available_reports' => array_column($catalog['reports'], 'name'),
            'capabilities' => $catalog['capabilities'],
        ];
    }

    protected function buildReportFilters(array $args): array
    {
        $dateFrom = $this->normalizeDate(
            $args['date_from'] ?? $args['created_from'] ?? $args['assigned_date_from'] ?? null
        );
        $dateTo = $this->normalizeDate(
            $args['date_to'] ?? $args['created_to'] ?? $args['assigned_date_to'] ?? null
        );

        $filters = array_filter([
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            // Pipeline report reads these query keys.
            'created_from' => $dateFrom,
            'created_to' => $dateTo,
            'assigned_to' => $args['assigned_to'] ?? null,
            'stage' => $args['stage'] ?? null,
            'workflow_key' => $args['workflow_key'] ?? null,
        ], fn ($value) => $value !== null && $value !== '');

        return [
            'ok' => true,
            'filters' => $filters,
        ];
    }

    protected function navigateReport(User $user, array $args): array
    {
        $report = $this->catalog->findReport((string) ($args['report'] ?? ''));
        if (! $report) {
            return ['ok' => false, 'message' => 'Report not found in catalog.'];
        }

        if (! $this->catalog->canShowReport($user, $report['permission'])) {
            return [
                'ok' => false,
                'message' => 'You do not have permission to view this report.',
                'report' => $report['name'],
            ];
        }

        $filters = $this->buildReportFilters($args)['filters'];
        $query = http_build_query($filters);
        $path = $report['path'].($query !== '' ? '?'.$query : '');

        return [
            'ok' => true,
            'report' => $report['name'],
            'path' => $path,
            'pathname' => $report['path'],
            'search' => $query !== '' ? '?'.$query : '',
            'filters' => $filters,
            'ui_actions' => [
                [
                    'type' => 'navigate',
                    'path' => $path,
                    'pathname' => $report['path'],
                    'search' => $query !== '' ? '?'.$query : '',
                    'label' => 'Open '.$report['name'],
                ],
            ],
        ];
    }

    protected function exportReport(User $user, array $args): array
    {
        $report = $this->catalog->findReport((string) ($args['report'] ?? ''));
        if (! $report) {
            return ['ok' => false, 'message' => 'Report not found in catalog.'];
        }

        if (! $this->catalog->canExportReport($user, $report['permission'])) {
            return [
                'ok' => false,
                'message' => 'You do not have permission to export this report.',
                'report' => $report['name'],
            ];
        }

        if (! $this->catalog->canShowReport($user, $report['permission'])) {
            return [
                'ok' => false,
                'message' => 'You do not have permission to view this report.',
                'report' => $report['name'],
            ];
        }

        $filters = $this->buildReportFilters($args)['filters'];
        $format = strtolower((string) ($args['format'] ?? 'xlsx'));
        if (! in_array($format, ['xlsx', 'csv', 'pdf'], true)) {
            $format = 'xlsx';
        }

        $fileName = Str::slug($report['key']).'-'.now()->format('Ymd-His').'.'.$format;
        $query = http_build_query(array_merge($filters, [
            'export' => '1',
            'format' => $format,
        ]));
        $path = $report['path'].($query !== '' ? "?{$query}" : '');

        $exportId = null;
        if (Schema::hasTable('exports')) {
            $export = Export::create([
                'tenant_id' => $user->tenant_id,
                'user_id' => $user->id,
                'module' => $report['name'],
                'action' => 'export',
                'file_name' => $fileName,
                'format' => $format,
                'status' => 'ready',
                'filters' => json_encode($filters),
                'meta_data' => [
                    'source' => 'besouhola_copilot',
                    'report_key' => $report['key'],
                    'path' => $path,
                ],
            ]);
            $exportId = $export->id;
        }

        return [
            'ok' => true,
            'report' => $report['name'],
            'format' => $format,
            'file_name' => $fileName,
            'export_id' => $exportId,
            'path' => $path,
            'filters' => $filters,
            'message' => 'Export is ready. Open the report to download with the applied filters.',
            'ui_actions' => [
                [
                    'type' => 'download',
                    'path' => $path,
                    'file_name' => $fileName,
                    'format' => $format,
                    'label' => 'Download '.$report['name'],
                ],
                [
                    'type' => 'navigate',
                    'path' => $path,
                    'label' => 'Open '.$report['name'],
                ],
            ],
        ];
    }

    protected function listDelayedLeads(User $user, array $args): array
    {
        if (! class_exists(Lead::class) || ! Schema::hasTable('leads')) {
            return [
                'ok' => true,
                'count' => 0,
                'leads' => [],
                'message' => 'Delayed leads are unavailable in this environment.',
            ];
        }

        $workflow = strtolower(trim((string) ($args['workflow_key'] ?? 'sales')));
        if (! in_array($workflow, ['sales', 'telesales'], true)) {
            $workflow = 'sales';
        }

        $limit = max(1, min((int) ($args['limit'] ?? 10), 25));
        $eligibleStatuses = ['scheduled', 'Scheduled', 'pending', 'in_progress', 'in-progress', 'in progress'];

        $query = Lead::query()->where('workflow_key', $workflow);

        $viewableIds = $this->getViewableUserIds($user);
        if ($viewableIds !== null) {
            $query->where(function ($q) use ($viewableIds, $user) {
                $q->whereIn('assigned_to', $viewableIds)
                    ->orWhere('manager_id', $user->id);
            });
        }

        if (! empty($args['assigned_to'])) {
            $query->where('assigned_to', (int) $args['assigned_to']);
        }

        $query->whereHas('actions', function ($q) use ($eligibleStatuses) {
            $q->whereIn('details->status', $eligibleStatuses)
                ->whereNotIn('action_type', ['closing_deals', 'cancel'])
                ->whereNotNull('details->date')
                ->where('details->date', '!=', '');
        });

        $leads = $query->with(['assignedAgent:id,name'])
            ->latest('updated_at')
            ->limit($limit)
            ->get(['id', 'name', 'phone', 'stage', 'assigned_to', 'workflow_key', 'updated_at']);

        $items = $leads->map(function (Lead $lead) {
            return [
                'id' => $lead->id,
                'name' => $lead->name,
                'phone' => $lead->phone,
                'stage' => $lead->stage,
                'assigned_to' => $lead->assigned_to,
                'assigned_name' => $lead->assignedAgent?->name,
                'workflow_key' => $lead->workflow_key,
            ];
        })->values()->all();

        return [
            'ok' => true,
            'count' => count($items),
            'workflow_key' => $workflow,
            'leads' => $items,
            'ui_actions' => array_map(fn ($lead) => [
                'type' => 'lead_card',
                'lead_id' => $lead['id'],
                'title' => $lead['name'] ?: ('Lead #'.$lead['id']),
                'subtitle' => trim(($lead['stage'] ?? '').' · '.($lead['assigned_name'] ?? 'Unassigned')),
            ], $items),
        ];
    }

    protected function draftCreateTask(User $user, array $args): array
    {
        $leadId = (int) ($args['lead_id'] ?? 0);
        if ($leadId <= 0) {
            return [
                'ok' => false,
                'state' => 'needs_input',
                'resource' => 'task',
                'requires_confirmation' => false,
                'missing_fields' => ['lead_id'],
                'message' => 'lead_id is required.',
                'ui_actions' => [],
            ];
        }

        $lead = $this->findVisibleLead($user, $leadId);
        if (! $lead) {
            return [
                'ok' => false,
                'state' => 'rejected',
                'resource' => 'task',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'message' => 'Lead not found or not visible to you.',
                'ui_actions' => [],
            ];
        }

        $payload = [
            'lead_id' => $lead->id,
            'title' => (string) ($args['title'] ?? ('Follow up lead #'.$lead->id)),
            'description' => (string) ($args['description'] ?? ('Follow up delayed lead: '.($lead->name ?: '#'.$lead->id))),
            'priority' => (string) ($args['priority'] ?? 'medium'),
            'status' => 'pending',
            'due_date' => $this->normalizeDate($args['due_date'] ?? null),
            'assigned_to' => isset($args['assigned_to']) ? (int) $args['assigned_to'] : ($lead->assigned_to ?: $user->id),
            'related_to' => 'lead',
            'related_ref' => (string) $lead->id,
        ];

        return [
            'ok' => true,
            'state' => 'awaiting_confirmation',
            'resource' => 'task',
            'requires_confirmation' => true,
            'missing_fields' => [],
            'message' => 'Task draft ready. Confirm to create it.',
            'payload' => $payload,
            'summary' => [
                'lead_id' => $lead->id,
                'lead_name' => $lead->name,
                'title' => $payload['title'],
                'priority' => $payload['priority'],
                'status' => $payload['status'],
                'due_date' => $payload['due_date'],
                'assigned_to' => $payload['assigned_to'],
            ],
            'ui_actions' => [
                [
                    'type' => 'confirm_action',
                    'action' => 'create_task_for_lead',
                    'payload' => $payload,
                    'label' => 'Create task',
                ],
            ],
        ];
    }

    protected function createTaskForLead(User $user, array $payload): array
    {
        $leadId = (int) ($payload['lead_id'] ?? 0);
        $lead = $this->findVisibleLead($user, $leadId);
        if (! $lead) {
            return [
                'ok' => false,
                'state' => 'rejected',
                'resource' => 'task',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'message' => 'Lead not found or not visible to you.',
                'ui_actions' => [],
            ];
        }

        if (! Schema::hasTable('tasks')) {
            return [
                'ok' => false,
                'state' => 'failed',
                'resource' => 'task',
                'requires_confirmation' => false,
                'missing_fields' => [],
                'message' => 'Tasks table is unavailable.',
                'ui_actions' => [],
            ];
        }

        Auth::setUser($user);

        $task = Task::create([
            'title' => (string) ($payload['title'] ?? ('Follow up lead #'.$lead->id)),
            'description' => (string) ($payload['description'] ?? ''),
            'status' => (string) ($payload['status'] ?? 'pending'),
            'priority' => (string) ($payload['priority'] ?? 'medium'),
            'assigned_to' => $payload['assigned_to'] ?? $user->id,
            'due_date' => $payload['due_date'] ?? null,
            'related_to' => 'lead',
            'related_ref' => (string) $lead->id,
            'created_by' => $user->id,
            'created_by_name' => $user->name ?? 'Besouhola Copilot',
        ]);

        return [
            'ok' => true,
            'state' => 'completed',
            'resource' => 'task',
            'requires_confirmation' => false,
            'missing_fields' => [],
            'message' => 'Task created successfully.',
            'payload' => $payload,
            'task' => [
                'id' => $task->id,
                'title' => $task->title,
                'lead_id' => $lead->id,
            ],
            'ui_actions' => [
                [
                    'type' => 'navigate',
                    'path' => '/tasks',
                    'label' => 'Open tasks',
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

    protected function normalizeDate(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $raw = trim((string) $value);

        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $raw, $m)) {
            return sprintf('%04d-%02d-%02d', (int) $m[1], (int) $m[2], (int) $m[3]);
        }

        if (preg_match('/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/', $raw, $m)) {
            $day = (int) $m[1];
            $month = (int) $m[2];
            $year = (int) $m[3];

            if ($day <= 12 && $month > 12) {
                [$day, $month] = [$month, $day];
            }

            if ($month < 1 || $month > 12 || $day < 1 || $day > 31) {
                return null;
            }

            return sprintf('%04d-%02d-%02d', $year, $month, $day);
        }

        try {
            return \Carbon\Carbon::parse($raw)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }
}




