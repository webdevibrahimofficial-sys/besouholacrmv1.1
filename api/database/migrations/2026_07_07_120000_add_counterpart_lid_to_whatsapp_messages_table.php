<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->string('counterpart_lid')->nullable()->after('message_id');
            $table->index(['tenant_id', 'counterpart_lid'], 'wa_messages_tenant_counterpart_lid_idx');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->dropIndex('wa_messages_tenant_counterpart_lid_idx');
            $table->dropColumn('counterpart_lid');
        });
    }
};
