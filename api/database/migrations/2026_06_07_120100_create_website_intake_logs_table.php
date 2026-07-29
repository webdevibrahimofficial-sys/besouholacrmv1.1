<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('website_intake_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->nullable();
            $table->foreignId('website_connection_id')->nullable()->constrained('website_connections')->nullOnDelete();
            $table->string('status', 32);
            $table->json('payload')->nullable();
            $table->text('error_message')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('origin', 255)->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->unsignedBigInteger('lead_id')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('tenant_id');
            $table->index('website_connection_id');
            $table->index('status');
            $table->index('created_at');
            $table->index('lead_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('website_intake_logs');
    }
};
