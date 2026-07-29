<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::connection('landlord')->hasTable('tenant_backups')) {
            return;
        }

        Schema::connection('landlord')->create('tenant_backups', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->nullable();
            $table->string('scope')->default('tenant');
            $table->string('tenancy_type')->nullable();
            $table->string('type')->default('dedicated');
            $table->string('disk')->default('local_backups');
            $table->string('path')->nullable();
            $table->string('status')->default('pending');
            $table->string('source')->default('database');
            $table->string('engine')->nullable();
            $table->unsignedBigInteger('requested_by_user_id')->nullable();
            $table->unsignedBigInteger('size_bytes')->nullable();
            $table->string('checksum', 128)->nullable();
            $table->json('metadata')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->index(['tenant_id', 'status']);
            $table->index(['scope', 'status']);
        });
    }

    public function down(): void
    {
        Schema::connection('landlord')->dropIfExists('tenant_backups');
    }
};
