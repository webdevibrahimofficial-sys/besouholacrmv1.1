<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_group_contacts', function (Blueprint $table) {
            $table->json('meta_data')->nullable()->after('last_synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_group_contacts', function (Blueprint $table) {
            $table->dropColumn('meta_data');
        });
    }
};
