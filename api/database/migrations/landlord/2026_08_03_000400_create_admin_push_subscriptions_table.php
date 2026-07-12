<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::connection('landlord')->hasTable('admin_push_subscriptions')) {
            Schema::connection('landlord')->create('admin_push_subscriptions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('admin_user_id')->constrained('users')->cascadeOnDelete();
                $table->text('endpoint');
                $table->string('endpoint_hash', 64)->nullable();
                $table->text('public_key');
                $table->text('auth_token');
                $table->text('user_agent')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamp('revoked_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::connection('landlord')->dropIfExists('admin_push_subscriptions');
    }
};
