<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('contract_templates', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id')->index();
            $table->unsignedBigInteger('project_id')->nullable()->index();
            $table->string('name');
            $table->longText('body')->nullable();
            $table->string('status')->default('Active'); // Active/Inactive
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contract_templates');
    }
};

