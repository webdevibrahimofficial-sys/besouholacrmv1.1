<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->json('modules')->nullable();
            $table->json('company_type_overrides')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('display_order')->default(0);
            $table->timestamps();
        });

        $now = now();

        DB::table('subscription_plans')->insert([
            [
                'code' => 'basic',
                'name' => 'Basic',
                'description' => 'Dashboard, Leads Management, Inventory, Reports, User Management, Settings',
                'modules' => json_encode(['dashboard', 'leads', 'inventory', 'reports', 'users', 'settings']),
                'company_type_overrides' => json_encode(new stdClass()),
                'is_active' => true,
                'display_order' => 10,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'professional',
                'name' => 'Professional',
                'description' => 'Basic + Marketing',
                'modules' => json_encode(['dashboard', 'leads', 'inventory', 'reports', 'users', 'settings', 'campaigns']),
                'company_type_overrides' => json_encode(new stdClass()),
                'is_active' => true,
                'display_order' => 20,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            [
                'code' => 'enterprise',
                'name' => 'Enterprise',
                'description' => 'Professional + Customers for General or Contracts for Real Estate',
                'modules' => json_encode(['dashboard', 'leads', 'inventory', 'reports', 'users', 'settings', 'campaigns', 'customers']),
                'company_type_overrides' => json_encode([
                    'Real Estate' => ['dashboard', 'leads', 'inventory', 'reports', 'users', 'settings', 'campaigns', 'contract_collections'],
                ]),
                'is_active' => true,
                'display_order' => 30,
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_plans');
    }
};
