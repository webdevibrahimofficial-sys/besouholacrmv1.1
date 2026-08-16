<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_unassigned_contacts', function (Blueprint $table) {
            $table->text('first_message_body')->nullable()->after('first_message_at');
        });
    }

    public function down(): void
    {
        Schema::table('whatsapp_unassigned_contacts', function (Blueprint $table) {
            $table->dropColumn('first_message_body');
        });
    }
};
