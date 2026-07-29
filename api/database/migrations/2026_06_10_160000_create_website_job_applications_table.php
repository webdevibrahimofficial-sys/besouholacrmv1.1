<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('website_job_applications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->foreignId('website_connection_id')->nullable()->constrained('website_connections')->nullOnDelete();
            $table->string('status', 40)->default('new');
            $table->string('source', 80)->default('website_careers');
            $table->string('role_slug')->nullable();
            $table->string('role_title')->nullable();
            $table->string('full_name');
            $table->string('email');
            $table->string('phone', 50);
            $table->string('current_role')->nullable();
            $table->string('years_experience', 50)->nullable();
            $table->string('location')->nullable();
            $table->string('work_preference', 80)->nullable();
            $table->string('linkedin_url')->nullable();
            $table->string('portfolio_url')->nullable();
            $table->string('salary_expectation')->nullable();
            $table->string('availability')->nullable();
            $table->text('motivation')->nullable();
            $table->text('biggest_achievement')->nullable();
            $table->text('cover_letter')->nullable();
            $table->string('cv_path')->nullable();
            $table->string('cv_original_name')->nullable();
            $table->string('cv_mime', 120)->nullable();
            $table->unsignedBigInteger('cv_size')->nullable();
            $table->json('answers')->nullable();
            $table->json('meta_data')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->string('origin')->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'role_slug']);
            $table->index(['website_connection_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('website_job_applications');
    }
};
