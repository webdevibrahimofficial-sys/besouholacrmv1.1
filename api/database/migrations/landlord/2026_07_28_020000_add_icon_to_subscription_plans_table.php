<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->string('icon')->nullable()->after('name');
        });

        DB::table('subscription_plans')
            ->where('code', 'basic')
            ->update(['icon' => 'layers']);

        DB::table('subscription_plans')
            ->where('code', 'professional')
            ->update(['icon' => 'briefcase']);

        DB::table('subscription_plans')
            ->where('code', 'enterprise')
            ->update(['icon' => 'building']);
    }

    public function down(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn('icon');
        });
    }
};
