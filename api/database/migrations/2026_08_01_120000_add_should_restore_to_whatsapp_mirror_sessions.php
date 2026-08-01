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

        Schema::table('whatsapp_mirror_sessions', function (Blueprint $table) {
            if (! Schema::hasColumn('whatsapp_mirror_sessions', 'should_restore')) {
                $table->boolean('should_restore')->default(false)->after('status');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('whatsapp_mirror_sessions')) {
            return;
        }

        Schema::table('whatsapp_mirror_sessions', function (Blueprint $table) {
            if (Schema::hasColumn('whatsapp_mirror_sessions', 'should_restore')) {
                $table->dropColumn('should_restore');
            }
        });
    }
};
