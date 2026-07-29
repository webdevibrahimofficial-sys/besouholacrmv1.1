<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'allowed_countries')) {
                $table->json('allowed_countries')->nullable()->after('meta_data');
            }

            if (!Schema::hasColumn('users', 'allowed_regions')) {
                $table->json('allowed_regions')->nullable()->after('allowed_countries');
            }

            if (!Schema::hasColumn('users', 'allowed_sources')) {
                $table->json('allowed_sources')->nullable()->after('allowed_regions');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $columns = array_values(array_filter([
                Schema::hasColumn('users', 'allowed_countries') ? 'allowed_countries' : null,
                Schema::hasColumn('users', 'allowed_regions') ? 'allowed_regions' : null,
                Schema::hasColumn('users', 'allowed_sources') ? 'allowed_sources' : null,
            ]));

            if (!empty($columns)) {
                $table->dropColumn($columns);
            }
        });
    }
};
