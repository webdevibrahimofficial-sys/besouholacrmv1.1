<?php

namespace App\Console\Commands;

use App\Models\Lead;
use App\Models\Tenant;
use Illuminate\Console\Command;

class BackfillLeadOtherMobileFromNotes extends Command
{
    protected $signature = 'leads:backfill-other-mobile-from-notes
        {--dry-run : Preview affected leads without writing changes}
        {--tenant= : Limit to a single tenant slug while testing}';

    protected $description = 'Move legacy "Other phones:" values from lead notes into meta_data.other_mobile and clean notes.';

    private const OTHER_PHONES_PATTERN = '/(?:^|\n)\s*Other phones?\s*:\s*([^\n]+)/i';

    public function handle(): int
    {
        $isDryRun = (bool) $this->option('dry-run');
        $tenantSlug = trim((string) $this->option('tenant'));
        $tenantId = null;

        if ($tenantSlug !== '') {
            $tenant = Tenant::query()->where('slug', $tenantSlug)->first();
            if (!$tenant) {
                $this->error("Tenant not found for slug: {$tenantSlug}");
                return self::FAILURE;
            }

            $tenantId = (int) $tenant->id;
            $this->info("Scoped to tenant: {$tenant->slug} (id={$tenantId})");
        }

        $this->info($isDryRun ? 'Running in DRY-RUN mode.' : 'Running LIVE migration.');
        $this->newLine();

        $processed = 0;
        $updated = 0;
        $skipped = 0;

        $query = Lead::query()
            ->whereNotNull('notes')
            ->where('notes', 'like', '%Other phone%')
            ->orderBy('id');

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $query->chunkById(200, function ($leads) use ($isDryRun, &$processed, &$updated, &$skipped) {
            foreach ($leads as $lead) {
                $processed++;

                $notes = (string) ($lead->notes ?? '');
                if (!preg_match(self::OTHER_PHONES_PATTERN, $notes, $matches)) {
                    $skipped++;
                    continue;
                }

                $legacyOtherPhones = trim((string) ($matches[1] ?? ''));
                if ($legacyOtherPhones === '') {
                    $skipped++;
                    continue;
                }

                $meta = is_array($lead->meta_data ?? null) ? $lead->meta_data : [];
                $existingOtherPhones = trim((string) ($meta['other_mobile'] ?? ''));
                $mergedOtherPhones = $this->mergePhoneLists($existingOtherPhones, $legacyOtherPhones);
                $cleanedNotes = $this->cleanNotes($notes);

                $wouldChangeMeta = $mergedOtherPhones !== $existingOtherPhones;
                $wouldChangeNotes = $cleanedNotes !== trim($notes);

                if (!$wouldChangeMeta && !$wouldChangeNotes) {
                    $skipped++;
                    continue;
                }

                $updated++;

                $this->line(sprintf(
                    '#%d tenant=%s other_mobile: "%s" -> "%s"',
                    $lead->id,
                    (string) ($lead->tenant_id ?? '-'),
                    $existingOtherPhones,
                    $mergedOtherPhones
                ));

                if ($isDryRun) {
                    continue;
                }

                if ($mergedOtherPhones !== '') {
                    $meta['other_mobile'] = $mergedOtherPhones;
                } else {
                    unset($meta['other_mobile']);
                }

                $lead->forceFill([
                    'meta_data' => !empty($meta) ? $meta : null,
                    'notes' => $cleanedNotes !== '' ? $cleanedNotes : null,
                ])->save();
            }
        });

        $this->newLine();
        $this->info(sprintf(
            'Processed: %d, Updated: %d, Skipped: %d%s',
            $processed,
            $updated,
            $skipped,
            $isDryRun ? ' (dry run)' : ''
        ));

        if ($isDryRun && $updated > 0) {
            $this->comment('Re-run without --dry-run to apply the migration.');
        }

        return self::SUCCESS;
    }

    private function cleanNotes(string $notes): string
    {
        return trim((string) preg_replace(
            ['/(\r\n|\r)/', self::OTHER_PHONES_PATTERN, "/\n{3,}/"],
            ["\n", '', "\n\n"],
            $notes
        ));
    }

    private function mergePhoneLists(string $existing, string $legacy): string
    {
        $parts = array_merge(
            preg_split('/\s*\/\s*/', $existing) ?: [],
            preg_split('/\s*\/\s*/', $legacy) ?: []
        );

        $unique = [];
        foreach ($parts as $part) {
            $value = trim((string) $part);
            if ($value === '') {
                continue;
            }

            $key = preg_replace('/\s+/', '', strtolower($value));
            if (isset($unique[$key])) {
                continue;
            }

            $unique[$key] = $value;
        }

        return implode(' / ', array_values($unique));
    }
}
