<?php

namespace App\Console\Commands;

use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\LeadWorkflowHistory;
use App\Services\TelesalesService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class BackfillDelayedReassignmentResets extends Command
{
    protected $signature = 'leads:backfill-delayed-reassignment-resets
        {tenant? : Limit to a single tenant id}
        {--workflow=all : sales, telesales, or all}
        {--dry-run : Preview matching leads without saving changes}';

    protected $description = 'Backfill delayed leads so reassigned New Lead / Cold Calls handoffs stop inheriting old overdue follow-ups.';

    private const OPEN_FOLLOW_UP_STATUSES = ['scheduled', 'Scheduled', 'pending', 'in_progress', 'in-progress', 'in progress'];

    public function __construct(private readonly TelesalesService $telesalesService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $tenantId = $this->argument('tenant') ? (int) $this->argument('tenant') : null;
        $workflow = strtolower(trim((string) $this->option('workflow')));
        $isDryRun = (bool) $this->option('dry-run');

        if (!in_array($workflow, ['sales', 'telesales', 'all'], true)) {
            $this->error('Invalid --workflow value. Use sales, telesales, or all.');
            return self::FAILURE;
        }

        if ($isDryRun) {
            $this->comment('Running in --dry-run mode. No database changes will be saved.');
        }

        $workflows = $workflow === 'all' ? ['sales', 'telesales'] : [$workflow];
        $totalCandidates = 0;
        $totalUpdatedLeads = 0;
        $totalUpdatedActions = 0;
        $totalSkipped = 0;

        foreach ($workflows as $currentWorkflow) {
            $this->newLine();
            $this->info("Scanning {$currentWorkflow} delayed leads...");

            $query = Lead::query()
                ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
                ->whereNull('deleted_at')
                ->whereDoesntHave('referralUsers')
                ->with(['stageRelation:id,name,type,meta_data,workflow_key']);

            if ($currentWorkflow === TelesalesService::WORKFLOW_TELESALES) {
                $query->where('workflow_key', TelesalesService::WORKFLOW_TELESALES);
            } else {
                $query->where('workflow_key', TelesalesService::WORKFLOW_SALES);
            }

            $query->whereHas('actions', function ($actionQuery) {
                $actionQuery->whereIn('details->status', self::OPEN_FOLLOW_UP_STATUSES)
                    ->whereNotIn('action_type', ['closing_deals', 'cancel'])
                    ->whereNotIn('next_action_type', ['closing_deals', 'cancel'])
                    ->whereNotNull('details->date')
                    ->where('details->date', '!=', '');
            });

            $query->orderBy('id')->chunkById(200, function ($leads) use (
                $currentWorkflow,
                $isDryRun,
                &$totalCandidates,
                &$totalUpdatedLeads,
                &$totalUpdatedActions,
                &$totalSkipped
            ) {
                foreach ($leads as $lead) {
                    $latestDelayedAction = $this->resolveLatestDelayedAction($lead);
                    if (!$latestDelayedAction) {
                        continue;
                    }

                    $targetStage = $this->inferResetStageForBackfill($lead, $currentWorkflow);
                    if (!$targetStage) {
                        $totalSkipped++;
                        continue;
                    }

                    $totalCandidates++;
                    $this->line(sprintf(
                        'Lead #%d [%s] -> %s',
                        (int) $lead->id,
                        $currentWorkflow,
                        $targetStage
                    ));

                    if ($isDryRun) {
                        continue;
                    }

                    $updatedActions = $this->telesalesService->resetLeadFollowUpOnReassignment($lead, null, $targetStage);
                    if ($updatedActions > 0) {
                        $totalUpdatedLeads++;
                        $totalUpdatedActions += $updatedActions;
                    }
                }
            });
        }

        $this->newLine();
        $this->info(sprintf(
            'Done. candidates=%d, updated_leads=%d, updated_actions=%d, skipped=%d%s',
            $totalCandidates,
            $totalUpdatedLeads,
            $totalUpdatedActions,
            $totalSkipped,
            $isDryRun ? ' (dry run)' : ''
        ));

        return self::SUCCESS;
    }

    private function resolveLatestDelayedAction(Lead $lead): ?LeadAction
    {
        $latest = LeadAction::query()
            ->where('lead_id', $lead->id)
            ->whereIn('details->status', self::OPEN_FOLLOW_UP_STATUSES)
            ->whereNotIn('action_type', ['closing_deals', 'cancel'])
            ->whereNotIn('next_action_type', ['closing_deals', 'cancel'])
            ->whereNotNull('details->date')
            ->where('details->date', '!=', '')
            ->orderByDesc('created_at')
            ->first();

        if (!$latest) {
            return null;
        }

        $details = is_array($latest->details ?? null)
            ? ($latest->details ?? [])
            : (json_decode($latest->details, true) ?? []);

        $date = trim((string) ($details['date'] ?? ''));
        if ($date === '') {
            return null;
        }

        $time = trim((string) ($details['time'] ?? ''));
        if ($time === '') {
            $time = '00:00';
        }

        try {
            $scheduled = Carbon::createFromFormat('Y-m-d H:i', $date . ' ' . substr($time, 0, 5), config('app.timezone'));
        } catch (\Throwable $e) {
            try {
                $scheduled = Carbon::createFromFormat('Y-m-d H:i:s', $date . ' ' . $time, config('app.timezone'));
            } catch (\Throwable $ex) {
                return null;
            }
        }

        return now(config('app.timezone'))->greaterThanOrEqualTo($scheduled->copy()->addMinute())
            ? $latest
            : null;
    }

    private function inferResetStageForBackfill(Lead $lead, string $workflow): ?string
    {
        $fromStage = $this->inferResetStageFromCurrentStage($lead);
        if ($fromStage) {
            return $fromStage;
        }

        $historyAction = $workflow === TelesalesService::WORKFLOW_TELESALES ? 'lead_reassigned' : 'transfer_to_sales';

        $historyQuery = LeadWorkflowHistory::query()
            ->where('lead_id', $lead->id)
            ->where('action', $historyAction)
            ->latest('id');

        if ($workflow === TelesalesService::WORKFLOW_TELESALES) {
            $history = $historyQuery->first();
            if (!$history) {
                return null;
            }

            $meta = is_array($history->meta_data ?? null)
                ? ($history->meta_data ?? [])
                : (json_decode((string) $history->meta_data, true) ?? []);

            $options = is_array($meta['options'] ?? null) ? ($meta['options'] ?? []) : [];
            if ((bool) ($options['sameStage'] ?? false)) {
                return null;
            }

            $method = strtolower(trim((string) ($meta['method'] ?? '')));
            return $method === 'cold_call' ? 'cold_calls' : 'new_lead';
        }

        $history = $historyQuery->first();
        if (!$history) {
            return null;
        }

        $meta = is_array($history->meta_data ?? null)
            ? ($history->meta_data ?? [])
            : (json_decode((string) $history->meta_data, true) ?? []);

        $stage = strtolower(trim((string) ($meta['stage'] ?? '')));
        if (in_array($stage, ['new_lead', 'cold_calls'], true)) {
            return $stage;
        }

        return null;
    }

    private function inferResetStageFromCurrentStage(Lead $lead): ?string
    {
        $candidates = [];

        $candidates[] = strtolower(trim((string) ($lead->stage ?? '')));

        if ($lead->relationLoaded('stageRelation') && $lead->stageRelation) {
            $candidates[] = strtolower(trim((string) ($lead->stageRelation->name ?? '')));
            $candidates[] = strtolower(trim((string) ($lead->stageRelation->type ?? '')));

            $meta = is_array($lead->stageRelation->meta_data ?? null)
                ? ($lead->stageRelation->meta_data ?? [])
                : (json_decode((string) $lead->stageRelation->meta_data, true) ?? []);
            $candidates[] = strtolower(trim((string) ($meta['system_key'] ?? '')));
        }

        foreach ($candidates as $candidate) {
            $normalized = str_replace(['-', '_'], ' ', preg_replace('/\s+/', ' ', $candidate) ?: '');
            $normalized = trim($normalized);

            if (in_array($normalized, ['cold calls', 'cold call', 'sales cold calls', 'telesales cold calls', 'sales cold calls'], true)
                || str_contains($normalized, 'cold call')) {
                return 'cold_calls';
            }

            if (in_array($normalized, ['new lead', 'new', 'fresh', 'sales new lead', 'telesales fresh'], true)
                || str_contains($normalized, 'new lead')
                || str_contains($normalized, 'fresh')) {
                return 'new_lead';
            }
        }

        return null;
    }
}
