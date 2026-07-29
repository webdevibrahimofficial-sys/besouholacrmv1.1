<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('sources') || Schema::hasColumn('sources', 'name_ar')) {
            return;
        }

        Schema::table('sources', function (Blueprint $table) {
            $table->string('name_ar')->nullable()->after('name');
            $table->index(['tenant_id', 'name_ar']);
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('sources') || !Schema::hasColumn('sources', 'name_ar')) {
            return;
        }

        Schema::table('sources', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'name_ar']);
            $table->dropColumn('name_ar');
        });
    }
};
