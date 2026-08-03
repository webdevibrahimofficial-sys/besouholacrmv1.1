<?php

namespace App\Services;

use App\Models\Feature;
use App\Models\Tenant;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TenantFeatureService
{
    public function tenantHasFeature(Tenant $tenant, string $featureKey): bool
    {
        return (bool) ($this->getFeatureMap($tenant)[$featureKey] ?? false);
    }

    public function getEnabledFeatures(Tenant $tenant): array
    {
        return array_keys(array_filter($this->getFeatureMap($tenant)));
    }

    public function getFeatureMap(Tenant $tenant): array
    {
        return Cache::remember($this->cacheKey($tenant), now()->addMinutes(10), function () use ($tenant) {
            return DB::connection('landlord')
                ->table('features')
                ->select(['features.key', 'features.is_active', 'tenant_features.is_enabled'])
                ->leftJoin('tenant_features', function ($join) use ($tenant) {
                    $join->on('tenant_features.feature_id', '=', 'features.id')
                        ->where('tenant_features.tenant_id', '=', $tenant->id);
                })
                ->get()
                ->mapWithKeys(function ($row) {
                    return [
                        $row->key => (bool) $row->is_active && (bool) $row->is_enabled,
                    ];
                })
                ->all();
        });
    }

    public function syncTenantFeatures(Tenant $tenant, array $features): void
    {
        foreach ($features as $feature) {
            $key = (string) ($feature['key'] ?? '');
            if ($key === '') {
                continue;
            }

            $enabled = filter_var($feature['is_enabled'] ?? false, FILTER_VALIDATE_BOOL, FILTER_NULL_ON_FAILURE);
            $config = is_array($feature['config'] ?? null) ? $feature['config'] : [];

            if ($enabled === null) {
                throw ValidationException::withMessages([
                    'features' => ["Feature '{$key}' has an invalid is_enabled value."],
                ]);
            }

            if ($enabled) {
                $this->enableFeature($tenant, $key, $config);
                continue;
            }

            $this->disableFeature($tenant, $key);
        }
    }

    public function enableFeature(Tenant $tenant, string $featureKey, array $config = []): void
    {
        $feature = $this->resolveFeature($featureKey);

        $tenant->features()->syncWithoutDetaching([
            $feature->id => [
                'is_enabled' => true,
                'config' => !empty($config) ? $config : null,
                'enabled_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $this->forgetTenantCache($tenant);
    }

    public function disableFeature(Tenant $tenant, string $featureKey): void
    {
        $feature = $this->resolveFeature($featureKey);

        $tenant->features()->syncWithoutDetaching([
            $feature->id => [
                'is_enabled' => false,
                'config' => null,
                'enabled_at' => null,
                'updated_at' => now(),
            ],
        ]);

        $this->forgetTenantCache($tenant);
    }

    public function forgetTenantCache(Tenant $tenant): void
    {
        Cache::forget($this->cacheKey($tenant));
    }

    protected function resolveFeature(string $featureKey): Feature
    {
        $feature = Feature::on('landlord')->where('key', $featureKey)->first();

        if ($feature) {
            return $feature;
        }

        throw ValidationException::withMessages([
            'features' => ["Feature '{$featureKey}' does not exist."],
        ]);
    }

    protected function cacheKey(Tenant $tenant): string
    {
        return "tenant_features_enabled_{$tenant->id}";
    }
}
