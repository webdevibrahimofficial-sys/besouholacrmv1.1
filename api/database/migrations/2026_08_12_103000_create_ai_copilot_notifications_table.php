<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('ai_copilot_notifications')) {
            return;
        }

        Schema::create('ai_copilot_notifications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->unsignedBigInteger('user_id')->index();
            $table->string('type', 64);
            $table->unsignedBigInteger('lead_id');
            $table->string('time_bucket', 32);
            $table->string('severity', 16)->default('info');
            $table->string('title');
            $table->text('preview');
            $table->json('payload');
            $table->unsignedBigInteger('conversation_id')->nullable()->index();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('dismissed_at')->nullable();
            $table->timestamp('first_opened_at')->nullable();
            $table->timestamps();

            $table->unique(
                ['tenant_id', 'user_id', 'type', 'lead_id', 'time_bucket'],
                'ai_copilot_notifications_dedupe_unique'
            );
            $table->index(['tenant_id', 'user_id', 'dismissed_at', 'created_at'], 'ai_copilot_notifications_inbox_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_copilot_notifications');
    }
};
