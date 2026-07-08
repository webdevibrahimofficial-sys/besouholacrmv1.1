<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('admin_push_subscriptions')) {
            Schema::create('admin_push_subscriptions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('admin_user_id')->constrained('users')->cascadeOnDelete();
                $table->text('endpoint');
                $table->string('endpoint_hash', 64);
                $table->text('public_key');
                $table->text('auth_token');
                $table->text('user_agent')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamp('revoked_at')->nullable();
                $table->timestamps();

                $table->index(['admin_user_id', 'revoked_at']);
                $table->unique(['admin_user_id', 'endpoint_hash'], 'admin_push_subscriptions_admin_endpoint_hash_unique');
            });

            return;
        }

        Schema::table('admin_push_subscriptions', function (Blueprint $table) {
            if (! Schema::hasColumn('admin_push_subscriptions', 'endpoint_hash')) {
                $table->string('endpoint_hash', 64)->nullable()->after('endpoint');
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_push_subscriptions');
    }
};

