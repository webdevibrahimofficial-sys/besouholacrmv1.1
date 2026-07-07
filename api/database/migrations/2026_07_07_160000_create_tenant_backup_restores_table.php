<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_backup_restores', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_backup_id');
            $table->unsignedBigInteger('source_tenant_id')->nullable();
            $table->unsignedBigInteger('restored_tenant_id')->nullable();
            $table->string('restore_mode')->default('new_tenant_copy');
            $table->string('status')->default('success');
            $table->unsignedBigInteger('requested_by_user_id')->nullable();
            $table->json('metadata')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_backup_id')->references('id')->on('tenant_backups')->onDelete('cascade');
            $table->foreign('source_tenant_id')->references('id')->on('tenants')->onDelete('set null');
            $table->foreign('restored_tenant_id')->references('id')->on('tenants')->onDelete('set null');
            $table->index(['tenant_backup_id', 'status']);
            $table->index(['restored_tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_backup_restores');
    }
};
