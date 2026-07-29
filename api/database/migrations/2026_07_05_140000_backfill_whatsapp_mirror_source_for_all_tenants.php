<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $tenantIds = DB::table('tenants')->pluck('id');

        foreach ($tenantIds as $tenantId) {
            $exists = DB::table('sources')
                ->where('tenant_id', $tenantId)
                ->whereRaw('LOWER(name) = ?', ['whatsapp mirror'])
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('sources')->insert([
                'tenant_id' => $tenantId,
                'name' => 'WhatsApp Mirror',
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('sources')
            ->whereRaw('LOWER(name) = ?', ['whatsapp mirror'])
            ->delete();
    }
};
