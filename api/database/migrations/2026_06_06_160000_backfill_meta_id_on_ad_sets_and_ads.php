<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('ad_sets')) {
            Schema::table('ad_sets', function (Blueprint $table) {
                if (!Schema::hasColumn('ad_sets', 'meta_id')) {
                    $table->string('meta_id')->nullable()->after('campaign_id');
                }
            });

            if (Schema::hasColumn('ad_sets', 'meta_adset_id')) {
                DB::table('ad_sets')
                    ->whereNull('meta_id')
                    ->whereNotNull('meta_adset_id')
                    ->update([
                        'meta_id' => DB::raw('meta_adset_id'),
                    ]);
            }

            Schema::table('ad_sets', function (Blueprint $table) {
                if (!Schema::hasColumn('ad_sets', 'meta_id')) {
                    return;
                }

                $table->index('meta_id', 'ad_sets_meta_id_index');
                $table->unique(['tenant_id', 'meta_id'], 'ad_sets_tenant_id_meta_id_unique');
            });
        }

        if (Schema::hasTable('ads')) {
            Schema::table('ads', function (Blueprint $table) {
                if (!Schema::hasColumn('ads', 'meta_id')) {
                    $table->string('meta_id')->nullable()->after('campaign_id');
                }
            });

            if (Schema::hasColumn('ads', 'meta_ad_id')) {
                DB::table('ads')
                    ->whereNull('meta_id')
                    ->whereNotNull('meta_ad_id')
                    ->update([
                        'meta_id' => DB::raw('meta_ad_id'),
                    ]);
            }

            Schema::table('ads', function (Blueprint $table) {
                if (!Schema::hasColumn('ads', 'meta_id')) {
                    return;
                }

                $table->index('meta_id', 'ads_meta_id_index');
                $table->unique(['tenant_id', 'meta_id'], 'ads_tenant_id_meta_id_unique');
            });
        }
    }

    public function down(): void
    {
        // Intentionally left conservative/no-op.
        // This migration backfills production data and should not remove `meta_id`
        // or copied values during rollback.
    }
};
