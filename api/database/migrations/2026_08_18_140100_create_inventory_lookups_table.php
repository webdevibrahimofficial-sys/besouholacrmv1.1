<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventory_lookups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('lookup_type');
            $table->string('name');
            $table->string('code')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['tenant_id', 'lookup_type', 'name'], 'inventory_lookups_tenant_type_name_unique');
            $table->index(['tenant_id', 'lookup_type', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_lookups');
    }
};
