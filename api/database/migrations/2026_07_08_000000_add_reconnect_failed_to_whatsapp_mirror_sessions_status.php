<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('whatsapp_mirror_sessions')) {
            return;
        }

        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }

        DB::statement("
            ALTER TABLE whatsapp_mirror_sessions
            MODIFY COLUMN status ENUM('disconnected', 'pending_qr', 'reconnecting', 'reconnect_failed', 'connected')
            NOT NULL DEFAULT 'disconnected'
        ");
    }

    public function down(): void
    {
        if (! Schema::hasTable('whatsapp_mirror_sessions')) {
            return;
        }

        $driver = DB::connection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }

        DB::statement("
            UPDATE whatsapp_mirror_sessions
            SET status = 'disconnected'
            WHERE status = 'reconnect_failed'
        ");

        DB::statement("
            ALTER TABLE whatsapp_mirror_sessions
            MODIFY COLUMN status ENUM('disconnected', 'pending_qr', 'reconnecting', 'connected')
            NOT NULL DEFAULT 'disconnected'
        ");
    }
};
