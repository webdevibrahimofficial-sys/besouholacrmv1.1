<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const ACTIVE_STATUSES = "'connecting','connected','migrating'";

    public function up(): void
    {
        Schema::create('whatsapp_channels', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('tenant_id');
            $table->string('provider', 32);
            $table->string('display_name')->nullable();
            $table->string('phone_number', 64)->nullable();
            $table->string('normalized_phone', 64)->nullable();
            $table->string('phone_number_id', 128)->nullable();
            $table->string('business_account_id', 128)->nullable();
            $table->unsignedBigInteger('mirror_session_id')->nullable();
            $table->text('access_token')->nullable();
            $table->string('status', 32)->default('pending');
            $table->boolean('is_primary')->default(false);
            $table->boolean('supports_inbound')->default(true);
            $table->boolean('supports_outbound')->default(true);
            $table->boolean('supports_ctwa_attribution')->default(false);
            $table->timestamp('last_connected_at')->nullable();
            $table->timestamp('last_disconnected_at')->nullable();
            $table->text('last_error')->nullable();
            $table->unsignedBigInteger('connected_by_user_id')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'provider']);
            $table->index('phone_number_id');
        });

        if (! in_array(Schema::getConnection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            return;
        }

        DB::statement(sprintf(
            'ALTER TABLE whatsapp_channels ADD active_phone_key VARCHAR(64) GENERATED ALWAYS AS (
                CASE WHEN status IN (%s) AND normalized_phone IS NOT NULL AND normalized_phone <> \'\'
                THEN normalized_phone ELSE NULL END
            ) STORED',
            self::ACTIVE_STATUSES
        ));

        DB::statement(sprintf(
            'ALTER TABLE whatsapp_channels ADD active_phone_number_id VARCHAR(128) GENERATED ALWAYS AS (
                CASE WHEN status IN (%s) AND phone_number_id IS NOT NULL AND phone_number_id <> \'\'
                THEN phone_number_id ELSE NULL END
            ) STORED',
            self::ACTIVE_STATUSES
        ));

        DB::statement('ALTER TABLE whatsapp_channels ADD UNIQUE KEY uq_tenant_active_phone (tenant_id, active_phone_key)');
        DB::statement('ALTER TABLE whatsapp_channels ADD UNIQUE KEY uq_active_phone_number_id (active_phone_number_id)');
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_channels');
    }
};
