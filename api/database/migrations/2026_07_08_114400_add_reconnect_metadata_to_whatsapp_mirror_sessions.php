<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_mirror_sessions', function (Blueprint $table) {
            $table->string('reconnect_reason', 100)->nullable()->after('history_synced_at');
            $table->text('reconnect_detail')->nullable()->after('reconnect_reason');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_mirror_sessions', function (Blueprint $table) {
            $table->dropColumn(['reconnect_reason', 'reconnect_detail']);
        });
    }
};
