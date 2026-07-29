<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('visits', function (Blueprint $table) {
            if (!Schema::hasColumn('visits', 'broker_id')) {
                $table->unsignedBigInteger('broker_id')->nullable()->after('lead_id');
                $table->index('broker_id');
            }

            if (!Schema::hasColumn('visits', 'broker_name')) {
                $table->string('broker_name')->nullable()->after('sales_person_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('visits', function (Blueprint $table) {
            if (Schema::hasColumn('visits', 'broker_name')) {
                $table->dropColumn('broker_name');
            }

            if (Schema::hasColumn('visits', 'broker_id')) {
                $table->dropIndex(['broker_id']);
                $table->dropColumn('broker_id');
            }
        });
    }
};
