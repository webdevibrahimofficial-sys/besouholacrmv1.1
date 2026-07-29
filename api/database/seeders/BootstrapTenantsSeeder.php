<?php

namespace Database\Seeders;

use App\Models\Tenant;
use App\Models\User;
use App\Services\SystemAdminPermissionService;
use App\Services\TenantService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class BootstrapTenantsSeeder extends Seeder
{
    public function run(): void
    {
        $tenantService = app(TenantService::class);
        $today = now()->toDateString();

        $tenants = [
            [
                'slug' => 'owner',
                'name' => 'Owner Tenant',
                'domain' => 'owner.localhost',
                'subscription_plan' => 'core',
                'company_type' => 'General',
                'users_limit' => 5,
                'sync_plan' => 'core',
            ],
            [
                'slug' => 'besouhola',
                'name' => 'Besouhola',
                'domain' => 'besouhola.localhost',
                'subscription_plan' => 'professional',
                'company_type' => 'General',
                'users_limit' => 10,
                'sync_plan' => 'professional',
            ],
            [
                'slug' => 'real-estate',
                'name' => 'Real Estate',
                'domain' => 'real-estate.localhost',
                'subscription_plan' => 'enterprise',
                'company_type' => 'Real Estate',
                'users_limit' => 10,
                'sync_plan' => 'enterprise',
            ],
        ];

        foreach ($tenants as $item) {
            $tenant = Tenant::updateOrCreate(
                ['slug' => $item['slug']],
                [
                    'name' => $item['name'],
                    'domain' => $item['domain'],
                    'status' => 'active',
                    'subscription_plan' => $item['subscription_plan'],
                    'company_type' => $item['company_type'],
                    'users_limit' => $item['users_limit'],
                    'start_date' => $today,
                    'end_date' => null,
                    'tenancy_type' => 'shared',
                ]
            );

            $tenantService->syncTenantModules($tenant, $item['sync_plan'], []);
        }

        $ownerTenant = Tenant::where('slug', 'owner')->first();
        if ($ownerTenant) {
            $user = User::updateOrCreate(
                ['email' => 'system@besouhoula.com'],
                [
                    'name' => 'Super Admin',
                    'password' => Hash::make('SystemAdmin123!'),
                    'tenant_id' => $ownerTenant->id,
                    'is_super_admin' => true,
                ]
            );

            app(SystemAdminPermissionService::class)->bootstrapLegacySuperAdmin($user);
        }

        $this->command?->info('Tenants bootstrapped: owner, besouhola, real-estate.');
    }
}
