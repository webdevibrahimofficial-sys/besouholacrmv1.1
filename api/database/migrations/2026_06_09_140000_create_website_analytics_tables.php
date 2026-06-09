<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('website_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('session_id', 64);
            $table->string('first_page_url', 2048)->nullable();
            $table->string('first_page_path', 500)->nullable();
            $table->string('first_referrer', 2048)->nullable();
            $table->string('utm_source')->nullable();
            $table->string('utm_campaign')->nullable();
            $table->string('utm_medium')->nullable();
            $table->string('device', 50)->nullable();
            $table->string('browser', 100)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->unsignedInteger('page_views_count')->default(0);
            $table->unsignedInteger('events_count')->default(0);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'session_id']);
            $table->index(['tenant_id', 'started_at']);
            $table->index(['tenant_id', 'last_seen_at']);
        });

        Schema::create('website_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('website_session_id')->nullable()->constrained('website_sessions')->nullOnDelete();
            $table->string('session_id', 64);
            $table->string('event_name', 50);
            $table->string('page_url', 2048)->nullable();
            $table->string('page_path', 500)->nullable();
            $table->string('form_name')->nullable();
            $table->string('service_slug')->nullable();
            $table->string('utm_source')->nullable();
            $table->string('utm_campaign')->nullable();
            $table->string('utm_medium')->nullable();
            $table->string('referrer', 2048)->nullable();
            $table->string('device', 50)->nullable();
            $table->string('browser', 100)->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('occurred_at');
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'event_name', 'occurred_at']);
            $table->index(['tenant_id', 'session_id']);
            $table->index(['tenant_id', 'page_path']);
            $table->index(['tenant_id', 'form_name']);
            $table->index(['tenant_id', 'utm_campaign']);
        });

        Schema::create('website_page_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('website_session_id')->nullable()->constrained('website_sessions')->nullOnDelete();
            $table->string('session_id', 64);
            $table->string('page_url', 2048)->nullable();
            $table->string('page_path', 500)->nullable();
            $table->string('referrer', 2048)->nullable();
            $table->string('utm_source')->nullable();
            $table->string('utm_campaign')->nullable();
            $table->string('utm_medium')->nullable();
            $table->string('device', 50)->nullable();
            $table->string('browser', 100)->nullable();
            $table->timestamp('viewed_at');
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'viewed_at']);
            $table->index(['tenant_id', 'page_path']);
            $table->index(['tenant_id', 'session_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('website_page_views');
        Schema::dropIfExists('website_events');
        Schema::dropIfExists('website_sessions');
    }
};
