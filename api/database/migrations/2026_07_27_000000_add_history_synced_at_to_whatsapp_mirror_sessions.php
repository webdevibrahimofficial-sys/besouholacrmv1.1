<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_mirror_sessions', function (Blueprint $table) {
            $table->timestamp('history_synced_at')->nullable()->after('last_connected_at');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_mirror_sessions', function (Blueprint $table) {
            $table->dropColumn('history_synced_at');
        });
    }
};
