<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * One-time data fix: rows created BEFORE the isLikelyLidLength() fix in
     * wa-mirror-service (and before the is_unresolved_lid column existed)
     * were never flagged, even though their "phone" is actually a WhatsApp
     * LID (e.g. "120569026592815", 14-16 digits). This backfills the flag
     * for any existing row whose phone looks like a LID, so:
     *   - the frontend badge shows up for them, and
     *   - `php artisan whatsapp-mirror:backfill-lids` can pick them up.
     */
    public function up(): void
    {
        DB::table('whatsapp_unassigned_contacts')
            ->whereRaw('LENGTH(phone) >= 14')
            ->update(['is_unresolved_lid' => true]);
    }

    public function down(): void
    {
        // Not reversible in a meaningful way (we don't know which rows were
        // flagged by this migration vs. flagged later by real-time traffic).
    }
};
