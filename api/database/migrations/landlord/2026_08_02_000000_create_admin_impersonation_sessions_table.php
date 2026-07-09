<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_impersonation_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->unsignedBigInteger('tenant_user_id')->nullable();
            $table->string('mode', 64)->default('support_access');
            $table->text('reason')->nullable();
            $table->string('token_hash', 64)->nullable();
            $table->timestamp('bridge_token_used_at')->nullable();
            $table->unsignedBigInteger('support_session_token_id')->nullable();
            $table->string('status', 32)->default('active');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->unsignedBigInteger('ended_by')->nullable();
            $table->string('ended_reason', 255)->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->string('origin_panel', 100)->nullable();
            $table->json('meta_data')->nullable();
            $table->timestamps();

            $table->index(['admin_user_id', 'status']);
            $table->index(['tenant_id', 'status']);
            $table->index(['support_session_token_id', 'status']);
            $table->index(['expires_at', 'status']);
            $table->index('bridge_token_used_at');
            $table->index('token_hash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_impersonation_sessions');
    }
};
