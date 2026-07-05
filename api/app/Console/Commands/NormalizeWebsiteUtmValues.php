<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NormalizeWebsiteUtmValues extends Command
{
    protected $signature = 'analytics:normalize-utm
        {--dry-run : Preview affected row counts without writing any changes}
        {--tenant= : Limit to a single tenant by slug (safe way to test first)}';

    protected $description = 'Normalize existing utm_source/utm_medium (trim+lowercase) and utm_campaign (trim only) values across website_sessions, website_events and website_page_views.';

    /**
     * Tables + how each tracking column should be normalized.
     * 'lower' => trim + lowercase (utm_source, utm_medium)
     * 'trim'  => trim only (utm_campaign)
     */
    private const TARGETS = [
        'website_sessions' => [
            'utm_source' => 'lower',
            'utm_medium' => 'lower',
            'utm_campaign' => 'trim',
        ],
        'website_events' => [
            'utm_source' => 'lower',
            'utm_medium' => 'lower',
            'utm_campaign' => 'trim',
        ],
        'website_page_views' => [
            'utm_source' => 'lower',
            'utm_medium' => 'lower',
            'utm_campaign' => 'trim',
        ],
    ];

    public function handle(): int
    {
        $isDryRun = (bool) $this->option('dry-run');
        $tenantSlug = $this->option('tenant');
        $tenantId = null;

        if ($tenantSlug) {
            $tenant = Tenant::query()->where('slug', $tenantSlug)->first();
            if (!$tenant) {
                $this->error("Tenant not found for slug: {$tenantSlug}");
                return self::FAILURE;
            }
            $tenantId = $tenant->id;
            $this->info("Scoped to tenant: {$tenant->slug} (id={$tenantId})");
        }

        $this->info($isDryRun ? 'Running in DRY-RUN mode (no data will change).' : 'Running LIVE (data will be updated).');
        $this->newLine();

        $totalAffected = 0;

        foreach (self::TARGETS as $table => $columns) {
            foreach ($columns as $column => $mode) {
                $affected = $this->normalizeColumn($table, $column, $mode, $tenantId, $isDryRun);
                $totalAffected += $affected;

                $this->line(sprintf(
                    '%-20s %-14s [%s] %s rows %s',
                    $table,
                    $column,
                    $mode,
                    $affected,
                    $isDryRun ? 'would be updated' : 'updated'
                ));
            }
        }

        $this->newLine();
        $this->info("Total rows " . ($isDryRun ? 'that would be updated' : 'updated') . ": {$totalAffected}");

        if ($isDryRun && $totalAffected > 0) {
            $this->comment('Re-run without --dry-run to apply changes. Consider testing with --tenant=<slug> first.');
        }

        return self::SUCCESS;
    }

    /**
     * Builds and (optionally) executes the UPDATE for a single table/column.
     * Handles: NULL passthrough, empty-after-trim -> NULL, lower+trim vs trim-only.
     */
    private function normalizeColumn(string $table, string $column, string $mode, ?int $tenantId, bool $dryRun): int
    {
        $targetExpression = $mode === 'lower'
            ? "LOWER(TRIM({$column}))"
            : "TRIM({$column})";

        // Rows that need a change: non-null, and either the value differs from
        // its normalized form, or the trimmed value is an empty string (-> NULL).
        $matchQuery = DB::table($table)
            ->whereNotNull($column)
            ->where(function ($query) use ($column, $targetExpression) {
                $query->whereRaw("{$column} != {$targetExpression}")
                    ->orWhereRaw("TRIM({$column}) = ''");
            });

        if ($tenantId) {
            $matchQuery->where('tenant_id', $tenantId);
        }

        $affected = $matchQuery->count();

        if ($dryRun || $affected === 0) {
            return $affected;
        }

        $updateQuery = DB::table($table)
            ->whereNotNull($column)
            ->where(function ($query) use ($column, $targetExpression) {
                $query->whereRaw("{$column} != {$targetExpression}")
                    ->orWhereRaw("TRIM({$column}) = ''");
            });

        if ($tenantId) {
            $updateQuery->where('tenant_id', $tenantId);
        }

        // Empty-after-trim becomes NULL; otherwise apply the normalized expression.
        $updateQuery->update([
            $column => DB::raw("CASE WHEN TRIM({$column}) = '' THEN NULL ELSE {$targetExpression} END"),
        ]);

        return $affected;
    }
}
