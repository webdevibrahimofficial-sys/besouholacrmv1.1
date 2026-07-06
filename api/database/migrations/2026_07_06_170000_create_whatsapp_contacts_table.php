<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Persistent "Contact Resolver Layer" store.
     *
     * This mirrors what WhatsApp Web itself relies on internally: a local
     * cache of every jid/lid/phone/name combination the session has ever
     * observed (via contacts.upsert, contacts.update, message events, and
     * history sync), independent of any single group snapshot. Group
     * contact sync and message auto-resolve both consult this table before
     * giving up and marking something as an unresolved LID.
     */
    public function up(): void
    {
        Schema::create('whatsapp_contacts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->string('session_id', 64)->nullable()->index();
            $table->string('jid', 191)->nullable()->index();
            $table->string('lid', 64)->nullable()->index();
            $table->string('phone', 32)->nullable()->index();
            $table->string('name')->nullable();
            $table->string('push_name')->nullable();
            $table->string('verified_name')->nullable();
            $table->json('raw')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'lid'], 'whatsapp_contacts_tenant_lid_unique');
            $table->unique(['tenant_id', 'phone'], 'whatsapp_contacts_tenant_phone_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_contacts');
    }
};
