<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('website_intake_logs', function (Blueprint $table) {
            $table->index(
                ['tenant_id', 'website_connection_id', 'created_at'],
                'wil_tenant_connection_created_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::table('website_intake_logs', function (Blueprint $table) {
            $table->dropIndex('wil_tenant_connection_created_idx');
        });
    }
};
