<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('website_connections', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('url')->nullable();
            $table->string('key_prefix', 32);
            $table->string('api_key_hash', 64)->unique();
            $table->boolean('is_active')->default(true);
            $table->foreignId('default_campaign_id')->nullable()->constrained('campaigns')->nullOnDelete();
            $table->foreignId('default_source_id')->nullable()->constrained('sources')->nullOnDelete();
            $table->json('allowed_origins')->nullable();
            $table->boolean('allow_all_origins_for_testing')->default(false);
            $table->timestamp('last_used_at')->nullable();
            $table->unsignedBigInteger('requests_count')->default(0);
            $table->timestamps();

            $table->index('tenant_id');
            $table->index('is_active');
            $table->index(['tenant_id', 'is_active']);
            $table->index('default_campaign_id');
            $table->index('default_source_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('website_connections');
    }
};
