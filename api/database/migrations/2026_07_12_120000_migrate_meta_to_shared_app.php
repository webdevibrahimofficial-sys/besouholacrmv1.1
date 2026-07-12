<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meta_data_deletion_requests', function (Blueprint $table) {
            $table->id();
            $table->string('fb_user_id')->index();
            $table->string('confirmation_code')->unique();
            $table->string('status')->default('completed');
            $table->unsignedInteger('connections_deleted')->default(0);
            $table->unsignedInteger('pages_deleted')->default(0);
            $table->json('payload')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        if (Schema::hasTable('meta_connections') && !Schema::hasColumn('meta_connections', 'needs_reauth')) {
            Schema::table('meta_connections', function (Blueprint $table) {
                $table->boolean('needs_reauth')->default(false)->after('expires_at');
            });
        }

        Schema::dropIfExists('tenant_meta_apps');
    }

    public function down(): void
    {
        if (Schema::hasTable('meta_connections') && Schema::hasColumn('meta_connections', 'needs_reauth')) {
            Schema::table('meta_connections', function (Blueprint $table) {
                $table->dropColumn('needs_reauth');
            });
        }

        Schema::dropIfExists('meta_data_deletion_requests');

        if (!Schema::hasTable('tenant_meta_apps')) {
            Schema::create('tenant_meta_apps', function (Blueprint $table) {
                $table->id();
                $table->string('tenant_id');
                $table->string('app_id');
                $table->text('app_secret');
                $table->text('verify_token');
                $table->string('webhook_key')->unique();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }
    }
};
