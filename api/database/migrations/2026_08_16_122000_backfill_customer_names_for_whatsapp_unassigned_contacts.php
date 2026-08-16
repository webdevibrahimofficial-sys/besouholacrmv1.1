<?php

use App\Services\Whatsapp\WhatsappUnassignedContactService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('whatsapp_unassigned_contacts')) {
            return;
        }

        app(WhatsappUnassignedContactService::class)->backfillMissingCustomerNames();
    }

    public function down(): void
    {
        // Restored customer names should stay; rollback cannot reconstruct the overwritten values.
    }
};
