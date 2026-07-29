<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Spatie\Multitenancy\Models\Concerns\UsesTenantConnection;

class NormalizeWebsiteUtmValues extends Command
{
    use UsesTenantConnection;

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
        $tenants = Tenant::query()
            ->when($tenantSlug, fn ($query) => $query->where('slug', $tenantSlug))
            ->orderBy('id')
            ->get();

        if ($tenants->isEmpty()) {
            $this->error($tenantSlug
                ? "Tenant not found for slug: {$tenantSlug}"
                : 'No tenants found to normalize.'
            );
            return self::FAILURE;
        }

        if ($tenantSlug) {
            $tenant = $tenants->first();
            $this->info("Scoped to tenant: {$tenant->slug} (id={$tenant->id})");
        }

        $this->info($isDryRun ? 'Running in DRY-RUN mode (no data will change).' : 'Running LIVE (data will be updated).');
        $this->newLine();

        $totalAffected = 0;

        foreach (self::TARGETS as $table => $columns) {
            foreach ($columns as $column => $mode) {
                $affected = 0;

                foreach ($tenants as $tenant) {
                    $affected += (int) $tenant->execute(function () use ($table, $column, $mode, $tenant, $isDryRun) {
                        return $this->normalizeColumn($table, $column, $mode, (int) $tenant->id, $isDryRun);
                    });
                }

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
        $connection = DB::connection($this->getTenantConnectionName());

        // Rows that need a change: non-null, and either the value differs from
        // its normalized form, or the trimmed value is an empty string (-> NULL).
        $matchQuery = $connection->table($table)
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

        $updateQuery = $connection->table($table)
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
