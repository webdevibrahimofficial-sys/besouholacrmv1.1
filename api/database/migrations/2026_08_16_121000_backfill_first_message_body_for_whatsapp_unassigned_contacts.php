<?php

use App\Services\Whatsapp\WhatsappUnassignedContactService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (
            ! Schema::hasTable('whatsapp_unassigned_contacts')
            || ! Schema::hasColumn('whatsapp_unassigned_contacts', 'first_message_body')
            || ! Schema::hasTable('whatsapp_messages')
        ) {
            return;
        }

        app(WhatsappUnassignedContactService::class)->backfillMissingFirstMessages();
    }

    public function down(): void
    {
        // Keep restored first-message previews; they are still valid after rollback.
    }
};
