<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropUnique('items_code_unique');
            $table->unique(['tenant_id', 'code'], 'items_tenant_code_unique');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropUnique('items_tenant_code_unique');
            $table->unique('code', 'items_code_unique');
        });
    }
};
