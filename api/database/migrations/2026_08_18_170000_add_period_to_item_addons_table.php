<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('item_addons') || Schema::hasColumn('item_addons', 'period')) {
            return;
        }

        Schema::table('item_addons', function (Blueprint $table) {
            $table->string('period')->nullable()->after('price');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('item_addons') || ! Schema::hasColumn('item_addons', 'period')) {
            return;
        }

        Schema::table('item_addons', function (Blueprint $table) {
            $table->dropColumn('period');
        });
    }
};
