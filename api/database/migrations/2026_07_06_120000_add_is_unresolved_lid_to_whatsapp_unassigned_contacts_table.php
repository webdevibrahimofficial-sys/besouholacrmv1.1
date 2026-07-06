<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_unassigned_contacts', function (Blueprint $table) {
            // True when "phone" is actually a WhatsApp LID (pseudo id, usually
            // 14-16 digits) that we couldn't resolve to a real phone number,
            // instead of a genuine E.164 number. This happens when the sender
            // has privacy settings hiding their number, or the message came
            // through a linked device before WhatsApp exposed the real PN.
            // See wa-mirror-service/src/sessions/manager.js (isLikelyLidLength).
            $table->boolean('is_unresolved_lid')->default(false)->after('phone');
            $table->index(['tenant_id', 'is_unresolved_lid']);
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_unassigned_contacts', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'is_unresolved_lid']);
            $table->dropColumn('is_unresolved_lid');
        });
    }
};
