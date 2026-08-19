<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('items') || Schema::hasColumn('items', 'image')) {
            return;
        }

        Schema::table('items', function (Blueprint $table) {
            $table->string('image')->nullable()->after('name');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('items') || ! Schema::hasColumn('items', 'image')) {
            return;
        }

        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn('image');
        });
    }
};
