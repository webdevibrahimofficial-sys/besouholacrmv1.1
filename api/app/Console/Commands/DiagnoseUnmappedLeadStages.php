<?php

namespace App\Console\Commands;

use App\Models\Lead;
use App\Models\Stage;
use App\Models\Tenant;
use Illuminate\Console\Command;

class DiagnoseUnmappedLeadStages extends Command
{
    protected $signature = 'leads:diagnose-unmapped-stages
        {--tenant= : Tenant slug to inspect, for example tn}
        {--limit=50 : Maximum number of unmatched leads to print}
        {--include-duplicates : Include duplicate leads in the diagnostic output}';

    protected $description = 'Find leads whose current stage/status does not map to the known Leads Management stage cards for a tenant.';

    private const STATIC_STAGE_ALIASES = [
        'new' => 'new lead',
        'newlead' => 'new lead',
        'fresh' => 'new lead',
        'duplicate' => 'duplicate',
        'duplicates' => 'duplicate',
        'pending' => 'pending',
        'inprogress' => 'pending',
        'coldcall' => 'cold calls',
        'coldcalls' => 'cold calls',
        'followup' => 'follow up',
    ];

    public function handle(): int
    {
        $tenantSlug = trim((string) $this->option('tenant'));
        if ($tenantSlug === '') {
            $this->error('Please provide --tenant=<slug>.');
            return self::FAILURE;
        }

        $tenant = Tenant::query()->where('slug', $tenantSlug)->first();
        if (!$tenant) {
            $this->error("Tenant not found for slug: {$tenantSlug}");
            return self::FAILURE;
        }

        $tenantId = (int) $tenant->id;
        $limit = max(1, (int) $this->option('limit'));
        $includeDuplicates = (bool) $this->option('include-duplicates');

        $knownStageKeys = $this->buildKnownStageKeys($tenantId);
        $knownStageLabels = $this->buildKnownStageLabels($tenantId);

        $this->info("Diagnosing tenant {$tenant->slug} (id={$tenantId})");
        $this->line('Known stage keys: ' . implode(', ', $knownStageLabels));
        $this->newLine();

        $query = Lead::query()
            ->where('tenant_id', $tenantId)
            ->orderBy('id');

        if (!$includeDuplicates) {
            $query->where(function ($q) {
                $q->whereRaw("COALESCE(LOWER(stage), '') != 'duplicate'")
                    ->whereRaw("COALESCE(LOWER(status), '') != 'duplicate'");
            });
        }

        $totalLeads = (clone $query)->count();
        $unmatchedLeads = [];
        $matchedCount = 0;
        $stageBuckets = [];

        (clone $query)->chunkById(500, function ($leads) use (&$unmatchedLeads, &$matchedCount, &$stageBuckets, $knownStageKeys, $limit) {
            foreach ($leads as $lead) {
                $effectiveStage = $this->resolveEffectiveStage($lead);
                $normalized = $this->normalizeStageKey($effectiveStage);
                $canonical = $this->canonicalStageKey($normalized);

                $bucketKey = $canonical !== '' ? $canonical : '[empty]';
                $stageBuckets[$bucketKey] = ($stageBuckets[$bucketKey] ?? 0) + 1;

                if (isset($knownStageKeys[$canonical])) {
                    $matchedCount++;
                    continue;
                }

                if (count($unmatchedLeads) < $limit) {
                    $unmatchedLeads[] = [
                        'id' => $lead->id,
                        'name' => (string) ($lead->name ?? ''),
                        'stage' => (string) ($lead->stage ?? ''),
                        'status' => (string) ($lead->status ?? ''),
                        'effective' => $effectiveStage,
                        'normalized' => $canonical,
                        'assigned_to' => (string) ($lead->assigned_to ?? ''),
                        'project' => (string) ($lead->project ?? ''),
                        'source' => (string) ($lead->source ?? ''),
                    ];
                }
            }
        });

        $unmatchedCount = max(0, $totalLeads - $matchedCount);

        $this->info("Total inspected leads: {$totalLeads}");
        $this->info("Mapped to known stages: {$matchedCount}");
        $this->info("Unmapped / legacy leads: {$unmatchedCount}");
        $this->newLine();

        arsort($stageBuckets);
        $this->line('Top stage buckets:');
        foreach (array_slice($stageBuckets, 0, 20, true) as $key => $count) {
            $this->line(" - {$key}: {$count}");
        }

        $this->newLine();

        if ($unmatchedCount === 0) {
            $this->info('No unmapped leads were found.');
            return self::SUCCESS;
        }

        $this->warn('Unmapped leads sample:');
        foreach ($unmatchedLeads as $lead) {
            $this->line(sprintf(
                '#%d | %s | stage="%s" | status="%s" | effective="%s" | normalized="%s" | assigned_to=%s | project="%s" | source="%s"',
                $lead['id'],
                $lead['name'],
                $lead['stage'],
                $lead['status'],
                $lead['effective'],
                $lead['normalized'],
                $lead['assigned_to'],
                $lead['project'],
                $lead['source']
            ));
        }

        if ($unmatchedCount > count($unmatchedLeads)) {
            $this->comment('Increase --limit to print more unmatched leads.');
        }

        return self::SUCCESS;
    }

    private function buildKnownStageKeys(int $tenantId): array
    {
        $keys = [];

        foreach (self::STATIC_STAGE_ALIASES as $alias => $canonical) {
            $keys[$canonical] = true;
        }

        $stageRows = Stage::query()
            ->where('tenant_id', $tenantId)
            ->orWhereNull('tenant_id')
            ->orderBy('order')
            ->get(['name', 'name_ar']);

        foreach ($stageRows as $stage) {
            foreach ([(string) $stage->name, (string) $stage->name_ar] as $value) {
                $normalized = $this->canonicalStageKey($this->normalizeStageKey($value));
                if ($normalized !== '') {
                    $keys[$normalized] = true;
                }
            }
        }

        return $keys;
    }

    private function buildKnownStageLabels(int $tenantId): array
    {
        $keys = array_keys($this->buildKnownStageKeys($tenantId));
        sort($keys);
        return $keys;
    }

    private function resolveEffectiveStage(Lead $lead): string
    {
        $stage = trim((string) ($lead->stage ?? ''));
        $status = trim((string) ($lead->status ?? ''));

        if ($stage !== '') {
            return $stage;
        }

        if ($status !== '') {
            return $status;
        }

        return '';
    }

    private function normalizeStageKey(string $value): string
    {
        $normalized = strtolower(trim($value));
        $normalized = preg_replace('/[\s_-]+/', '', $normalized) ?? '';
        return $normalized;
    }

    private function canonicalStageKey(string $normalized): string
    {
        if ($normalized === '') {
            return '';
        }

        return self::STATIC_STAGE_ALIASES[$normalized] ?? $normalized;
    }
}
