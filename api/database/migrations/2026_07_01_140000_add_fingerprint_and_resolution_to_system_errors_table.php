<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('system_errors', function (Blueprint $table) {
            $table->string('fingerprint', 64)->nullable()->after('tenant_id')->index();
            $table->timestamp('resolved_at')->nullable()->after('last_seen_at')->index();
        });
    }

    public function down(): void
    {
        Schema::table('system_errors', function (Blueprint $table) {
            $table->dropColumn('resolved_at');
            $table->dropColumn('fingerprint');
        });
    }
};
