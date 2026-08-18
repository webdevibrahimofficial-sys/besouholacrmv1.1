<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('user_commission_tiers', function (Blueprint $table) {
            $table->string('scope', 32)->default('personal')->after('year');
            $table->index(['tenant_id', 'user_id', 'year', 'scope'], 'user_commission_tiers_scope_idx');
        });
    }

    public function down(): void
    {
        Schema::table('user_commission_tiers', function (Blueprint $table) {
            $table->dropIndex('user_commission_tiers_scope_idx');
            $table->dropColumn('scope');
        });
    }
};
