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

        DB::connection('landlord')->table('features')->updateOrInsert(
            ['key' => 'financial_decision_engine'],
            [
                'name' => 'Financial Decision Engine',
                'description' => 'Evaluate commercial offers with NPV, policy, and a backend-owned decision inside Copilot.',
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

        DB::connection('landlord')->table('features')->where('key', 'financial_decision_engine')->delete();
    }
};
