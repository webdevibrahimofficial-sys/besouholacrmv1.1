<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('projects') && ! Schema::hasColumn('projects', 'code')) {
            Schema::table('projects', function (Blueprint $table) {
                $table->string('code')->nullable()->after('name');
            });
        }

        if (Schema::hasTable('brokers') && ! Schema::hasColumn('brokers', 'code')) {
            Schema::table('brokers', function (Blueprint $table) {
                $table->string('code')->nullable()->after('name');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('projects') && Schema::hasColumn('projects', 'code')) {
            Schema::table('projects', function (Blueprint $table) {
                $table->dropColumn('code');
            });
        }

        if (Schema::hasTable('brokers') && Schema::hasColumn('brokers', 'code')) {
            Schema::table('brokers', function (Blueprint $table) {
                $table->dropColumn('code');
            });
        }
    }
};
