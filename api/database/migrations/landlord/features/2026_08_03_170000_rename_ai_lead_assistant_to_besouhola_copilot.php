<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::connection('landlord')->hasTable('features')) {
            return;
        }

        $legacy = DB::connection('landlord')->table('features')->where('key', 'ai_lead_assistant')->first();
        $current = DB::connection('landlord')->table('features')->where('key', 'besouhola_copilot')->first();

        if ($legacy && ! $current) {
            DB::connection('landlord')->table('features')
                ->where('id', $legacy->id)
                ->update([
                    'key' => 'besouhola_copilot',
                    'name' => 'Besouhola Copilot',
                    'description' => 'AI copilot for reports, filters, delayed leads, and tasks.',
                    'updated_at' => now(),
                ]);

            return;
        }

        if ($legacy && $current && Schema::connection('landlord')->hasTable('tenant_features')) {
            $legacyRows = DB::connection('landlord')
                ->table('tenant_features')
                ->where('feature_id', $legacy->id)
                ->get();

            foreach ($legacyRows as $row) {
                $existing = DB::connection('landlord')
                    ->table('tenant_features')
                    ->where('tenant_id', $row->tenant_id)
                    ->where('feature_id', $current->id)
                    ->first();

                if ($existing) {
                    if ($row->is_enabled && ! $existing->is_enabled) {
                        DB::connection('landlord')->table('tenant_features')->where('id', $existing->id)->update([
                            'is_enabled' => true,
                            'enabled_at' => $row->enabled_at ?: now(),
                            'updated_at' => now(),
                        ]);
                    }
                    DB::connection('landlord')->table('tenant_features')->where('id', $row->id)->delete();
                    continue;
                }

                DB::connection('landlord')->table('tenant_features')->where('id', $row->id)->update([
                    'feature_id' => $current->id,
                    'updated_at' => now(),
                ]);
            }

            DB::connection('landlord')->table('features')->where('id', $legacy->id)->delete();
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
        if (! Schema::connection('landlord')->hasTable('features')) {
            return;
        }

        DB::connection('landlord')->table('features')
            ->where('key', 'besouhola_copilot')
            ->update([
                'key' => 'ai_lead_assistant',
                'name' => 'AI Lead Assistant',
                'description' => 'AI assistant for Lead Management.',
                'updated_at' => now(),
            ]);
    }
};
