<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('whatsapp_mirror_sessions')) {
            return;
        }

        $hasHistorySyncedAt = Schema::hasColumn('whatsapp_mirror_sessions', 'history_synced_at');

        Schema::table('whatsapp_mirror_sessions', function (Blueprint $table) use ($hasHistorySyncedAt) {
            if (! Schema::hasColumn('whatsapp_mirror_sessions', 'reconnect_reason')) {
                $column = $table->string('reconnect_reason', 100)->nullable();
                if ($hasHistorySyncedAt) {
                    $column->after('history_synced_at');
                }
            }

            if (! Schema::hasColumn('whatsapp_mirror_sessions', 'reconnect_detail')) {
                $column = $table->text('reconnect_detail')->nullable();
                if (Schema::hasColumn('whatsapp_mirror_sessions', 'reconnect_reason')) {
                    $column->after('reconnect_reason');
                }
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('whatsapp_mirror_sessions')) {
            return;
        }

        Schema::table('whatsapp_mirror_sessions', function (Blueprint $table) {
            $columns = [];
            if (Schema::hasColumn('whatsapp_mirror_sessions', 'reconnect_reason')) {
                $columns[] = 'reconnect_reason';
            }
            if (Schema::hasColumn('whatsapp_mirror_sessions', 'reconnect_detail')) {
                $columns[] = 'reconnect_detail';
            }

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
