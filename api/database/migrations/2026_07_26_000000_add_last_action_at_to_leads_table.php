<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('leads', 'last_action_at')) {
            Schema::table('leads', function (Blueprint $table) {
                $table->timestamp('last_action_at')->nullable()->after('last_contact');
            });
        }

        DB::table('leads')
            ->update([
                'last_action_at' => DB::raw(
                    '(SELECT MAX(lead_actions.created_at) FROM lead_actions WHERE lead_actions.lead_id = leads.id)'
                ),
            ]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('leads', 'last_action_at')) {
            Schema::table('leads', function (Blueprint $table) {
                $table->dropColumn('last_action_at');
            });
        }
    }
};
