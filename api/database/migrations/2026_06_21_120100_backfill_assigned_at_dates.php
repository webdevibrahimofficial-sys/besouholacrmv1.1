<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Smart Hybrid Backfill Strategy for assigned_at
     * 
     * This migration implements a three-tier fallback strategy:
     * 1. First Action Date (from lead_actions) - Most reliable
     * 2. Updated_at (if > created_at) - Reasonable estimate
     * 3. Created_at - Safe fallback
     * 
     * This ensures:
     * - Logical consistency (assigned_at >= created_at)
     * - Historical accuracy when possible
     * - Safe rollback for newly assigned leads
     */

    public function up(): void
    {
        // Get database driver for dialect-specific queries
        $driver = DB::connection()->getDriverName();
        
        echo "\n========== SMART BACKFILL: assigned_at DATES ==========\n";
        echo "Driver: {$driver}\n";
        echo "Timestamp: " . now() . "\n\n";

        // Start transaction for safety
        DB::beginTransaction();

        try {
            // Count leads needing backfill
            $needsBackfill = DB::table('leads')
                ->whereNotNull('assigned_to')
                ->whereNull('assigned_at')
                ->count();

            echo "📊 Leads needing backfill: {$needsBackfill}\n\n";

            if ($needsBackfill === 0) {
                echo "✅ No leads to backfill. All good!\n";
                DB::commit();
                return;
            }

            // Strategy 1: Use first action date when available
            echo "🔍 Strategy 1: Searching for first action dates...\n";
            
            $updated1 = DB::table('leads')
                ->whereNotNull('assigned_to')
                ->whereNull('assigned_at')
                ->whereExists(function ($query) {
                    $query->select(DB::raw(1))
                        ->from('lead_actions')
                        ->whereColumn('lead_actions.lead_id', 'leads.id');
                })
                ->update([
                    'assigned_at' => DB::raw(
                        "CASE " .
                        "WHEN (SELECT MIN(created_at) FROM lead_actions WHERE lead_actions.lead_id = leads.id) < created_at " .
                        "THEN created_at " .
                        "ELSE (SELECT MIN(created_at) FROM lead_actions WHERE lead_actions.lead_id = leads.id) " .
                        "END"
                    )
                ]);

            echo "   ✓ Updated {$updated1} leads using first action date\n\n";

            // Strategy 2: Use updated_at if it's after created_at
            echo "🔍 Strategy 2: Using updated_at as estimate...\n";
            
            $updated2 = DB::table('leads')
                ->whereNotNull('assigned_to')
                ->whereNull('assigned_at')
                ->whereRaw('updated_at > created_at')
                ->update([
                    'assigned_at' => DB::raw('updated_at')
                ]);

            echo "   ✓ Updated {$updated2} leads using updated_at\n\n";

            // Strategy 3: Use created_at as safe fallback
            echo "🔍 Strategy 3: Using created_at as fallback...\n";
            
            $updated3 = DB::table('leads')
                ->whereNotNull('assigned_to')
                ->whereNull('assigned_at')
                ->update([
                    'assigned_at' => DB::raw('created_at')
                ]);

            echo "   ✓ Updated {$updated3} leads using created_at\n\n";

            // Verification
            echo "✅ VERIFICATION:\n";
            
            $remaining = DB::table('leads')
                ->whereNotNull('assigned_to')
                ->whereNull('assigned_at')
                ->count();

            echo "   Remaining with NULL assigned_at: {$remaining}\n";

            // Check for logical violations (assigned_at < created_at)
            $violations = DB::table('leads')
                ->whereRaw('assigned_at < created_at')
                ->count();

            echo "   Logical violations (assigned_at < created_at): {$violations}\n";

            if ($remaining > 0 || $violations > 0) {
                throw new \Exception(
                    "❌ Backfill verification failed! " .
                    "Remaining: {$remaining}, Violations: {$violations}"
                );
            }

            // Also backfill last_contact for existing leads if NULL
            echo "\n🔍 BONUS: Backfilling last_contact for existing leads...\n";
            
            $lastContactUpdated = DB::table('leads')
                ->whereNull('last_contact')
                ->update([
                    'last_contact' => DB::raw(
                        'COALESCE(' .
                        '(SELECT MIN(created_at) FROM lead_actions WHERE lead_actions.lead_id = leads.id), ' .
                        'CASE WHEN updated_at > created_at THEN updated_at ELSE created_at END' .
                        ')'
                    )
                ]);

            echo "   ✓ Updated {$lastContactUpdated} leads with last_contact values\n";

            echo "\n========== BACKFILL COMPLETE ==========\n";
            echo "✅ Total updated: " . ($updated1 + $updated2 + $updated3) . " leads (assigned_at)\n";
            echo "✅ Total updated: {$lastContactUpdated} leads (last_contact)\n";
            echo "✅ All dates populated correctly!\n";

            DB::commit();

        } catch (\Exception $e) {
            DB::rollBack();
            
            echo "\n❌ ERROR DURING BACKFILL:\n";
            echo $e->getMessage() . "\n";
            
            throw $e;
        }
    }

    public function down(): void
    {
        echo "\n========== ROLLING BACK: assigned_at DATES ==========\n";
        
        // Safe rollback: Only reset assigned_at for leads that were backfilled
        // We identify them by checking if assigned_at matches one of our strategies
        
        DB::beginTransaction();

        try {
            $this->resetBackfilledDates();
            DB::commit();
            
            echo "✅ Rollback complete. Only backfilled dates were reset.\n";

        } catch (\Exception $e) {
            DB::rollBack();
            
            echo "❌ ERROR DURING ROLLBACK:\n";
            echo $e->getMessage() . "\n";
            
            throw $e;
        }
    }

    /**
     * Safe rollback that only resets dates we actually backfilled
     */
    private function resetBackfilledDates(): void
    {
        // Count before
        $count = DB::table('leads')
            ->whereNotNull('assigned_to')
            ->whereNotNull('assigned_at')
            ->count();

        echo "Found {$count} leads with assigned_at...\n";

        // Strategy: Reset only leads where assigned_at matches our strategies
        // This leaves manually-set dates alone
        
        $updated = DB::table('leads')
            ->whereNotNull('assigned_to')
            ->whereNotNull('assigned_at')
            ->where(function ($query) {
                // Reset if assigned_at matches first action date
                $query->whereExists(function ($q) {
                    $q->select(DB::raw(1))
                        ->from('lead_actions')
                        ->whereColumn('lead_actions.lead_id', 'leads.id')
                        ->whereRaw('lead_actions.created_at = leads.assigned_at');
                })
                // OR reset if assigned_at matches updated_at
                ->orWhereRaw('assigned_at = updated_at')
                // OR reset if assigned_at matches created_at
                ->orWhereRaw('assigned_at = created_at');
            })
            ->update(['assigned_at' => null]);

        echo "✓ Reset {$updated} backfilled assigned_at values to NULL\n";
    }
};
