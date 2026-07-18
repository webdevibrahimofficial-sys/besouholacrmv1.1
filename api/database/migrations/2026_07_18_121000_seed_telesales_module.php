<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('modules')->updateOrInsert(
            ['slug' => 'telesales'],
            [
                'name' => 'Telesales',
                'description' => 'Independent pre-sales qualification workflow',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    public function down(): void
    {
        DB::table('modules')->where('slug', 'telesales')->delete();
    }
};
