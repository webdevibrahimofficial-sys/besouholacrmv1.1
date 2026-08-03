<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::connection('landlord')->hasTable('features')) {
            Schema::connection('landlord')->create('features', function (Blueprint $table) {
                $table->id();
                $table->string('key')->unique();
                $table->string('name');
                $table->text('description')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::connection('landlord')->hasTable('tenant_features')) {
            Schema::connection('landlord')->create('tenant_features', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $table->foreignId('feature_id')->constrained('features')->cascadeOnDelete();
                $table->boolean('is_enabled')->default(false);
                $table->json('config')->nullable();
                $table->timestamp('enabled_at')->nullable();
                $table->timestamps();

                $table->unique(['tenant_id', 'feature_id']);
            });
        }

        DB::connection('landlord')->table('features')->updateOrInsert(
            ['key' => 'besouhola_copilot'],
            [
                'name' => 'Besouhola Copilot',
                'description' => 'AI copilot for reports, filters, delayed leads, and tasks.',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    public function down(): void
    {
        Schema::connection('landlord')->dropIfExists('tenant_features');
        Schema::connection('landlord')->dropIfExists('features');
    }
};
