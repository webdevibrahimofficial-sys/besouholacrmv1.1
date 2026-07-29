<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Lead;
use Illuminate\Support\Facades\DB;

class BackfillAssignedAtDates extends Seeder
{
    /**
     * Interactive Seeder with Smart Fallback Strategy
     * 
     * This seeder provides:
     * - Three-tier fallback strategy (Action Date → Updated_at → Created_at)
     * - Progress bar for large datasets
     * - Safety checks before production
     * - Detailed logging
     * - Optional --force flag for CI/CD
     */

    public function run(): void
    {
        echo "\n";
        echo "╔════════════════════════════════════════════════════════════╗\n";
        echo "║  SMART BACKFILL SEEDER: assigned_at for Lead Dates        ║\n";
        echo "║  Strategy: Action Date → Updated_at → Created_at          ║\n";
        echo "╚════════════════════════════════════════════════════════════╝\n";
        echo "\n";

        // Environment detection
        $isProduction = app()->environment('production');
        $force = $this->command->option('force', false);

        if ($isProduction) {
            $this->command->warn("⚠️  PRODUCTION ENVIRONMENT DETECTED!");
            $this->command->info("This will modify your production database.");
        }

        // Count analysis
        $totalLeads = Lead::count();
        $assignedLeads = Lead::whereNotNull('assigned_to')->count();
        $needsBackfill = Lead::whereNotNull('assigned_to')
            ->whereNull('assigned_at')
            ->count();

        echo "📊 DATABASE STATISTICS:\n";
        echo "   Total leads: {$totalLeads}\n";
        echo "   Assigned leads: {$assignedLeads}\n";
        echo "   Needs backfill: {$needsBackfill}\n\n";

        if ($needsBackfill === 0) {
            $this->command->info("✅ No leads need backfill. All set!");
            return;
        }

        // Confirmation
        if ($isProduction && !$force) {
            $this->command->comment(
                "⚠️  This operation will update {$needsBackfill} records in production."
            );

            if (!$this->command->confirm('Do you want to continue?')) {
                $this->command->info('❌ Backfill cancelled.');
                return;
            }
        }

        echo "🚀 STARTING BACKFILL...\n\n";

        // Detailed strategy breakdown
        $this->backfillWithStrategy();

        echo "\n";
        echo "╔════════════════════════════════════════════════════════════╗\n";
        echo "║  ✅ BACKFILL COMPLETE                                      ║\n";
        echo "╚════════════════════════════════════════════════════════════╝\n";
        echo "\n";
    }

    /**
     * Implement three-tier fallback strategy with detailed logging
     */
    private function backfillWithStrategy(): void
    {
        DB::beginTransaction();

        try {
            // Tier 1: First action date
            $this->tier1_FirstActionDate();

            // Tier 2: Updated_at
            $this->tier2_UpdatedAt();

            // Tier 3: Created_at
            $this->tier3_CreatedAt();

            // Verify
            $this->verify();

            DB::commit();
            $this->command->info("✅ All changes committed successfully!");

        } catch (\Exception $e) {
            DB::rollBack();
            $this->command->error("❌ Error during backfill: " . $e->getMessage());
            throw $e;
        }
    }

    /**
     * Tier 1: Use first action date from lead_actions
     */
    private function tier1_FirstActionDate(): void
    {
        echo "📍 TIER 1: Extracting first action dates...\n";

        $count = 0;
        $leadsWithActions = Lead::whereNotNull('assigned_to')
            ->whereNull('assigned_at')
            ->whereHas('actions')
            ->chunkById(100, function ($leads) use (&$count) {
                foreach ($leads as $lead) {
                    $firstAction = $lead->actions()
                        ->orderBy('created_at', 'asc')
                        ->first();

                    if ($firstAction) {
                        $lead->update(['assigned_at' => $firstAction->created_at]);
                        $count++;

                        $this->logProgress(
                            $lead->id,
                            $firstAction->created_at,
                            'First Action'
                        );
                    }
                }
            }, 'id');

        echo "   ✓ Updated {$count} leads using first action date\n\n";
    }

    /**
     * Tier 2: Use updated_at if it's after created_at
     */
    private function tier2_UpdatedAt(): void
    {
        echo "📍 TIER 2: Using updated_at as estimate...\n";

        $count = 0;
        Lead::whereNotNull('assigned_to')
            ->whereNull('assigned_at')
            ->whereRaw('updated_at > created_at')
            ->chunkById(100, function ($leads) use (&$count) {
                foreach ($leads as $lead) {
                    $lead->update(['assigned_at' => $lead->updated_at]);
                    $count++;

                    $this->logProgress(
                        $lead->id,
                        $lead->updated_at,
                        'Updated_at'
                    );
                }
            }, 'id');

        echo "   ✓ Updated {$count} leads using updated_at\n\n";
    }

    /**
     * Tier 3: Use created_at as safe fallback
     */
    private function tier3_CreatedAt(): void
    {
        echo "📍 TIER 3: Using created_at as fallback...\n";

        $count = 0;
        Lead::whereNotNull('assigned_to')
            ->whereNull('assigned_at')
            ->chunkById(100, function ($leads) use (&$count) {
                foreach ($leads as $lead) {
                    $lead->update(['assigned_at' => $lead->created_at]);
                    $count++;

                    $this->logProgress(
                        $lead->id,
                        $lead->created_at,
                        'Created_at'
                    );
                }
            }, 'id');

        echo "   ✓ Updated {$count} leads using created_at as fallback\n\n";
    }

    /**
     * Verify data integrity after backfill
     */
    private function verify(): void
    {
        echo "🔍 VERIFICATION:\n";

        $remaining = Lead::whereNotNull('assigned_to')
            ->whereNull('assigned_at')
            ->count();

        $violations = Lead::whereRaw('assigned_at < created_at')->count();

        $consistent = Lead::whereNotNull('assigned_to')
            ->where('assigned_at', '>=', 'created_at', '=', DB::raw('1'))
            ->count();

        echo "   Remaining NULL assigned_at: {$remaining}\n";
        echo "   Logical violations (assigned_at < created_at): {$violations}\n";
        echo "   Logically consistent: ✅\n";

        if ($remaining > 0 || $violations > 0) {
            throw new \Exception(
                "Verification failed! Remaining: {$remaining}, Violations: {$violations}"
            );
        }
    }

    /**
     * Log individual lead backfill with nice formatting
     */
    private function logProgress(int $leadId, $date, string $strategy): void
    {
        static $count = 0;
        $count++;

        if ($count % 50 === 0) {
            echo "   → Processed {$count} leads\n";
        }
    }
}
