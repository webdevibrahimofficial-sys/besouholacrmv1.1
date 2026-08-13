<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_yearly_targets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('year');
            $table->decimal('yearly_target', 15, 2)->default(0);
            $table->decimal('monthly_target', 15, 2)->default(0);
            $table->decimal('quarterly_target', 15, 2)->default(0);
            $table->decimal('semi_annual_target', 15, 2)->default(0);
            $table->foreignId('created_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'user_id', 'year']);
            $table->index(['tenant_id', 'year']);
        });

        Schema::create('user_commission_tiers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('year');
            $table->decimal('from_percentage', 8, 2)->default(0);
            $table->decimal('to_percentage', 8, 2)->nullable();
            $table->decimal('commission_percentage', 8, 2)->default(0);
            $table->timestamps();

            $table->index(['tenant_id', 'user_id', 'year']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_commission_tiers');
        Schema::dropIfExists('user_yearly_targets');
    }
};
