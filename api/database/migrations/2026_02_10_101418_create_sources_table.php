<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('sources')) {
            Schema::create('sources', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->nullable()->constrained()->cascadeOnDelete();
                $table->string('name');
                $table->boolean('is_active')->default(true);
                $table->json('meta_data')->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'is_active']);
                $table->unique(['tenant_id', 'name']);
            });
        }

        if (!Schema::hasTable('tenants') || !Schema::hasTable('sources')) {
            return;
        }

        $tenantIds = DB::table('tenants')->pluck('id');

        foreach ($tenantIds as $tenantId) {
            $exists = DB::table('sources')
                ->where('tenant_id', $tenantId)
                ->whereRaw('LOWER(name) = ?', ['whatsapp mirror'])
                ->exists();

            if (!$exists) {
                DB::table('sources')->insert([
                    'tenant_id'  => $tenantId,
                    'name'       => 'WhatsApp Mirror',
                    'is_active'  => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('sources')) {
            return;
        }

        DB::table('sources')
            ->whereRaw('LOWER(name) = ?', ['whatsapp mirror'])
            ->delete();
    }
};
