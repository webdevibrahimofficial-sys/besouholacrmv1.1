<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            if (! Schema::hasColumn('whatsapp_messages', 'channel_id')) {
                $table->unsignedBigInteger('channel_id')->nullable()->after('tenant_id');
                $table->index('channel_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            if (Schema::hasColumn('whatsapp_messages', 'channel_id')) {
                $table->dropIndex(['channel_id']);
                $table->dropColumn('channel_id');
            }
        });
    }
};
