<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('tenant_meta_apps')) {
            return;
        }

        Schema::create('tenant_meta_apps', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_id')->unique();
            $table->string('mode')->default('shared'); // shared | custom
            $table->string('app_id')->nullable();
            $table->text('app_secret')->nullable();
            $table->text('verify_token')->nullable();
            $table->string('webhook_key')->unique();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_meta_apps');
    }
};
