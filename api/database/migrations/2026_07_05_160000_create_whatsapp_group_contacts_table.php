<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_group_contacts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->string('group_jid', 191);
            $table->string('group_name')->nullable();
            $table->string('participant_jid', 191)->nullable();
            $table->string('phone', 32);
            $table->string('push_name')->nullable();
            $table->string('status')->default('pending')->index();
            $table->unsignedBigInteger('converted_lead_id')->nullable()->index();
            $table->timestamp('first_seen_at')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'group_jid', 'phone'], 'wa_group_contacts_tenant_group_phone_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_group_contacts');
    }
};
