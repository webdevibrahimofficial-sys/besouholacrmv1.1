<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->string('source')->default('live')->after('provider');
            $table->unsignedBigInteger('lead_id')->nullable()->after('body');
            $table->index(['tenant_id', 'lead_id']);
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_messages', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'lead_id']);
            $table->dropColumn(['source', 'lead_id']);
        });
    }
};
