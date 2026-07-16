<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_message_attributions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->unsignedBigInteger('channel_id')->nullable();
            $table->unsignedBigInteger('whatsapp_message_id');
            $table->unsignedBigInteger('lead_id')->nullable();
            $table->string('ctwa_clid')->nullable();
            $table->string('source_id')->nullable();
            $table->string('source_type')->nullable();
            $table->string('source_url')->nullable();
            $table->string('headline')->nullable();
            $table->string('ad_name')->nullable();
            $table->string('campaign_name')->nullable();
            $table->json('referral_raw')->nullable();
            $table->timestamps();

            $table->unique('whatsapp_message_id');
            $table->index(['tenant_id', 'source_id']);
            $table->index(['tenant_id', 'lead_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_message_attributions');
    }
};
