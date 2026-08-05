<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('device_tokens', function (Blueprint $table) {
            $table->string('push_provider', 20)
                ->default('fcm')
                ->after('device_name');

            $table->index(['user_id', 'push_provider'], 'device_tokens_user_push_provider_index');
        });
    }

    public function down(): void
    {
        Schema::table('device_tokens', function (Blueprint $table) {
            $table->dropIndex('device_tokens_user_push_provider_index');
            $table->dropColumn('push_provider');
        });
    }
};
