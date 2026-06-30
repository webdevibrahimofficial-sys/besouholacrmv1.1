<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('task_categories', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->unsignedInteger('display_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $now = now();

        DB::table('task_categories')->insert([
            [
                'code' => 'operations',
                'name' => 'Operations',
                'description' => 'Platform operations, rollout, and process work.',
                'display_order' => 10,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'compliance',
                'name' => 'Compliance',
                'description' => 'Audit, policy, and governance follow-ups.',
                'display_order' => 20,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'security',
                'name' => 'Security',
                'description' => 'Access reviews, risk response, and security checks.',
                'display_order' => 30,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'infrastructure',
                'name' => 'Infrastructure',
                'description' => 'Hosting, backup, and system environment tasks.',
                'display_order' => 40,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'billing',
                'name' => 'Billing',
                'description' => 'Plan, payment, and commercial administration work.',
                'display_order' => 50,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'qa',
                'name' => 'QA',
                'description' => 'Release validation and quality assurance checklists.',
                'display_order' => 60,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('task_categories');
    }
};
