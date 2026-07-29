<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::connection('landlord')->hasTable('admin_notifications')) {
            return;
        }

        Schema::connection('landlord')->create('admin_notifications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('admin_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('related_tenant_id')->nullable()->constrained('tenants')->nullOnDelete();
            $table->string('type', 120);
            $table->string('title', 255);
            $table->text('body')->nullable();
            $table->string('category', 60)->default('system');
            $table->string('severity', 20)->default('info');
            $table->string('source', 80)->default('system');
            $table->string('dedupe_key', 191)->nullable();
            $table->string('action_url', 500)->nullable();
            $table->json('data')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();

            $table->index(['admin_user_id', 'created_at']);
            $table->index(['admin_user_id', 'read_at']);
            $table->index(['admin_user_id', 'archived_at']);
            $table->index(['category', 'severity']);
            $table->index(['source']);
            $table->index(['related_tenant_id']);
            $table->index(['admin_user_id', 'dedupe_key']);
        });
    }

    public function down(): void
    {
        Schema::connection('landlord')->dropIfExists('admin_notifications');
    }
};
