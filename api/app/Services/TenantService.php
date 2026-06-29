<?php

namespace App\Services;

use App\Models\Module;
use App\Models\SubscriptionPlan;
use App\Models\Tenant;
use Illuminate\Validation\ValidationException;

class TenantService
{
    protected $bootstrapper;

    public function __construct(TenantBootstrapper $bootstrapper)
    {
        $this->bootstrapper = $bootstrapper;
    }

    public function createTenant(array $data)
    {
        // Validate Slug
        if (in_array($data['slug'], ['admin', 'api', 'support', 'www', 'app'])) {
            throw ValidationException::withMessages(['slug' => 'This slug is reserved.']);
        }

        $plan = $data['plan'] ?? 'basic';

        $host = parse_url(config('app.url'), PHP_URL_HOST);
        $domain = $host ? ($data['slug'] . '.' . $host) : null;

        $tenant = Tenant::create([
            'name' => $data['company_name'],
            'slug' => $data['slug'],
            'subscription_plan' => $plan,
            'company_type' => $data['company_type'] ?? 'General',
            'users_limit' => $data['users_limit'] ?? 5,
            'start_date' => $data['start_date'] ?? now(),
            'end_date' => $data['end_date'] ?? null,
            'status' => 'active',
            'tenancy_type' => 'shared',
            'domain' => $domain,
            'country' => $data['country'] ?? null,
            'city' => $data['city'] ?? null,
            'state' => $data['state'] ?? null,
            'address_line_1' => $data['address_line_1'] ?? null,
            'address_line_2' => $data['address_line_2'] ?? null,
        ]);

        if (!empty($data['is_lifetime'])) {
            $meta = is_array($tenant->meta_data) ? $tenant->meta_data : [];
            $subscriptionMeta = $meta['subscription'] ?? [];
            $subscriptionMeta['is_lifetime'] = (bool) $data['is_lifetime'];
            $meta['subscription'] = $subscriptionMeta;
            $tenant->meta_data = $meta;
            $tenant->end_date = null;
            $tenant->save();
        }

        // Bootstrap
        $admin = $this->bootstrapper->bootstrap($tenant, [
            'name' => $data['admin_name'],
            'email' => $data['admin_email'],
            'password' => $data['admin_password'],
        ]);

        // Sync Modules based on Plan
        $customModules = $data['modules'] ?? [];
        $this->syncTenantModules($tenant, $plan, $customModules);

        return ['tenant' => $tenant, 'user' => $admin];
    }

    public function syncTenantModules(Tenant $tenant, string $plan, array $customModules = [])
    {
        $companyType = $tenant->company_type ?? 'General';
        $modules = $this->getModulesForPlan($plan, $companyType);
        
        if ($plan === 'custom' && !empty($customModules)) {
             // Merge common modules with custom selected modules
             $common = ['reports', 'settings'];
             
             // Expand 'inventory' in custom modules if present
             $expandedCustom = [];
             foreach ($customModules as $m) {
                 if ($m === 'inventory') {
                     $expandedCustom = array_merge($expandedCustom, $this->getInventoryModules($tenant->company_type));
                 } else {
                     $expandedCustom[] = $m;
                 }
             }
             
             $modules = array_unique(array_merge($common, $expandedCustom));
        }

        if (empty($modules)) {
            return;
        }

        // Systemwide removals / guards
        $modules = array_values(array_unique(array_filter($modules, function ($slug) use ($companyType) {
            if ($slug === 'support') return false;
            if ($slug === 'contract_collections' && $companyType !== 'Real Estate') return false;
            if ($slug === 'customers' && $companyType === 'Real Estate') return false;
            return true;
        })));

        // Upsert all modules in one query — avoids N+1 and race-condition duplicates
        $rows = array_map(fn (string $slug) => [
            'slug'       => $slug,
            'name'       => ucwords(str_replace(['-', '_'], ' ', $slug)),
            'is_active'  => true,
            'created_at' => now(),
            'updated_at' => now(),
        ], $modules);

        Module::upsert($rows, ['slug'], ['name', 'updated_at']);

        $moduleIds = Module::whereIn('slug', $modules)->pluck('id')->toArray();

        // Store detailed module configuration in meta_data
        if ($plan === 'custom') {
            $meta = $tenant->meta_data ?? [];
            $meta['subscription'] = array_merge($meta['subscription'] ?? [], [
                'custom_modules' => $customModules,
                'is_custom' => true,
                'activated_at' => now(),
            ]);
            $tenant->meta_data = $meta;
            $tenant->save();
        }

        $syncData = collect($moduleIds)->mapWithKeys(function ($id) {
            return [$id => ['is_enabled' => true, 'created_at' => now(), 'updated_at' => now()]];
        })->toArray();

        $tenant->modules()->sync($syncData);
    }

    protected function getModulesForPlan(string $plan, string $companyType = 'General'): array
    {
        $dbPlan = SubscriptionPlan::where('code', $plan)->where('is_active', true)->first();
        if ($dbPlan) {
            $overrides = is_array($dbPlan->company_type_overrides) ? $dbPlan->company_type_overrides : [];
            $overrideModules = $overrides[$companyType] ?? null;

            if (is_array($overrideModules) && !empty($overrideModules)) {
                return array_values(array_unique($overrideModules));
            }

            return array_values(array_unique(is_array($dbPlan->modules) ? $dbPlan->modules : []));
        }

        $basicBase = ['dashboard', 'reports', 'users', 'settings', 'leads'];

        $inventory = $this->getInventoryModules($companyType);
        $inventoryWithRoot = array_merge(['inventory'], $inventory);

        switch ($plan) {
            case 'basic':
                return array_merge($basicBase, $inventoryWithRoot);
            case 'professional':
                return array_merge($basicBase, ['campaigns'], $inventoryWithRoot);
            case 'enterprise':
                $enterprise = array_merge($basicBase, ['campaigns'], $inventoryWithRoot);
                if ($companyType === 'Real Estate') {
                    $enterprise[] = 'contract_collections';
                } else {
                    $enterprise[] = 'customers';
                }
                return $enterprise;
            case 'custom':
                return [];
            default:
                return array_merge($basicBase, $inventoryWithRoot);
        }
    }

    protected function getInventoryModules(string $companyType): array
    {
        if ($companyType === 'Real Estate') {
            return ['projects', 'properties', 'developers', 'brokers', 'requests'];
        }
        
        // General
        return ['items', 'orders'];
    }
}
