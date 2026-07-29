<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('property_unit_code_histories')) {
            return;
        }

        Schema::create('property_unit_code_histories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->nullable()->index();
            $table->unsignedBigInteger('property_id')->nullable()->index();
            $table->string('unit_code')->index();
            $table->string('reason')->default('deleted');
            $table->timestamps();

            $table->unique(['tenant_id', 'unit_code'], 'property_unit_code_histories_tenant_code_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_unit_code_histories');
    }
};
