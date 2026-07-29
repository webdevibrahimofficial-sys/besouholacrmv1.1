<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    protected array $tables = [
        'users',
        'campaigns',
        'landing_pages',
        'meta_connections',
        'meta_businesses',
        'meta_ad_accounts',
        'meta_pages',
    ];

    public function up(): void
    {
        foreach ($this->tables as $tableName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                if (!Schema::hasColumn($tableName, 'agency_id')) {
                    $table->string('agency_id')->nullable()->after('tenant_id');
                    $table->index(['tenant_id', 'agency_id'], "{$tableName}_tenant_agency_idx");
                }
            });
        }
    }

    public function down(): void
    {
        foreach ($this->tables as $tableName) {
            if (!Schema::hasTable($tableName) || !Schema::hasColumn($tableName, 'agency_id')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                try {
                    $table->dropIndex("{$tableName}_tenant_agency_idx");
                } catch (\Throwable $e) {
                }

                $table->dropColumn('agency_id');
            });
        }
    }
};
