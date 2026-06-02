<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('tenant_meta_apps')) {
            DB::statement('ALTER TABLE tenant_meta_apps MODIFY verify_token TEXT NOT NULL');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('tenant_meta_apps')) {
            DB::statement('ALTER TABLE tenant_meta_apps MODIFY verify_token VARCHAR(255) NOT NULL');
        }
    }
};
