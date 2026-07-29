<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('system_errors', function (Blueprint $table) {
            $table->index(['tenant_id', 'resolved_at'], 'sys_errors_tenant_resolved_idx');
            $table->index(['last_seen_at', 'level'], 'sys_errors_last_seen_level_idx');
            $table->index(['level', 'resolved_at'], 'sys_errors_level_resolved_idx');
            $table->index(['tenant_id', 'last_seen_at'], 'sys_errors_tenant_last_seen_idx');
        });
    }

    public function down(): void
    {
        Schema::table('system_errors', function (Blueprint $table) {
            $table->dropIndex('sys_errors_tenant_resolved_idx');
            $table->dropIndex('sys_errors_last_seen_level_idx');
            $table->dropIndex('sys_errors_level_resolved_idx');
            $table->dropIndex('sys_errors_tenant_last_seen_idx');
        });
    }
};
