<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_settings', function (Blueprint $table) {
            $table->boolean('auto_create_ctwa_leads')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_settings', function (Blueprint $table) {
            $table->dropColumn('auto_create_ctwa_leads');
        });
    }
};
