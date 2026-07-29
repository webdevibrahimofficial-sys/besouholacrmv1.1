<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('website_career_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->unique()->constrained()->cascadeOnDelete();
            $table->json('content')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('website_career_roles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('slug');
            $table->string('title');
            $table->string('department', 120)->nullable();
            $table->string('location', 160)->nullable();
            $table->string('work_type', 120)->nullable();
            $table->string('employment_type', 120)->nullable();
            $table->string('experience_level', 120)->nullable();
            $table->text('summary')->nullable();
            $table->longText('description')->nullable();
            $table->json('responsibilities')->nullable();
            $table->json('requirements')->nullable();
            $table->json('benefits')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_featured')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['tenant_id', 'slug']);
            $table->index(['tenant_id', 'is_active', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('website_career_roles');
        Schema::dropIfExists('website_career_pages');
    }
};
