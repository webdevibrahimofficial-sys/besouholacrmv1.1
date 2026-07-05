<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_unassigned_contacts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('phone', 64);
            $table->string('push_name')->nullable();
            $table->timestamp('first_message_at')->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->text('last_message_body')->nullable();
            $table->unsignedInteger('messages_count')->default(0);
            $table->string('status', 32)->default('pending');
            $table->unsignedBigInteger('converted_lead_id')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'phone']);
            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'last_message_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_unassigned_contacts');
    }
};
