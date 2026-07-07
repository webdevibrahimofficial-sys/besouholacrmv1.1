<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $driver = Schema::getConnection()->getDriverName();

        if ($driver === 'mysql') {
            DB::statement('ALTER TABLE tenant_backups DROP FOREIGN KEY tenant_backups_tenant_id_foreign');
            DB::statement('ALTER TABLE tenant_backups MODIFY tenant_id BIGINT UNSIGNED NULL');
            DB::statement('ALTER TABLE tenant_backups ADD CONSTRAINT tenant_backups_tenant_id_foreign FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE');
        }

        Schema::table('tenant_backups', function (Blueprint $table) {
            $table->string('scope')->default('tenant')->after('tenant_id');
            $table->string('tenancy_type')->nullable()->after('scope');
            $table->string('checksum', 128)->nullable()->after('size_bytes');
            $table->unsignedBigInteger('requested_by_user_id')->nullable()->after('engine');
            $table->json('metadata')->nullable()->after('checksum');
            $table->timestamp('expires_at')->nullable()->after('finished_at');
            $table->index(['scope', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('tenant_backups', function (Blueprint $table) {
            $table->dropIndex(['scope', 'status']);
            $table->dropColumn([
                'scope',
                'tenancy_type',
                'checksum',
                'requested_by_user_id',
                'metadata',
                'expires_at',
            ]);
        });
    }
};
