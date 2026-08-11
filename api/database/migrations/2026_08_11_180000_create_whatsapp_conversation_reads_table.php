<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('whatsapp_conversation_reads')) {
            return;
        }

        Schema::create('whatsapp_conversation_reads', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->unsignedBigInteger('user_id')->index();
            $table->string('conversation_key', 80);
            $table->timestamp('last_read_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'user_id', 'conversation_key'], 'wa_conv_reads_tenant_user_key_uq');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_conversation_reads');
    }
};
