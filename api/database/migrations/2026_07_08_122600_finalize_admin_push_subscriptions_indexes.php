<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('admin_push_subscriptions')) {
            return;
        }

        if (! Schema::hasColumn('admin_push_subscriptions', 'endpoint_hash')) {
            Schema::table('admin_push_subscriptions', function (Blueprint $table) {
                $table->string('endpoint_hash', 64)->nullable()->after('endpoint');
            });
        }

        DB::table('admin_push_subscriptions')
            ->select(['id', 'endpoint'])
            ->orderBy('id')
            ->chunkById(100, function ($rows) {
                foreach ($rows as $row) {
                    DB::table('admin_push_subscriptions')
                        ->where('id', $row->id)
                        ->update(['endpoint_hash' => hash('sha256', (string) $row->endpoint)]);
                }
            });

        try {
            Schema::table('admin_push_subscriptions', function (Blueprint $table) {
                $table->index(['admin_user_id', 'revoked_at'], 'admin_push_subscriptions_admin_revoked_index');
            });
        } catch (\Throwable $e) {
        }

        try {
            Schema::table('admin_push_subscriptions', function (Blueprint $table) {
                $table->unique(
                    ['admin_user_id', 'endpoint_hash'],
                    'admin_push_subscriptions_admin_endpoint_hash_unique'
                );
            });
        } catch (\Throwable $e) {
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('admin_push_subscriptions')) {
            return;
        }

        try {
            Schema::table('admin_push_subscriptions', function (Blueprint $table) {
                $table->dropUnique('admin_push_subscriptions_admin_endpoint_hash_unique');
            });
        } catch (\Throwable $e) {
        }

        try {
            Schema::table('admin_push_subscriptions', function (Blueprint $table) {
                $table->dropIndex('admin_push_subscriptions_admin_revoked_index');
            });
        } catch (\Throwable $e) {
        }
    }
};

