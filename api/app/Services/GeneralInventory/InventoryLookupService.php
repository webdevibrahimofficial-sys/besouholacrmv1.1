<?php

namespace App\Services\GeneralInventory;

use App\Models\InventoryLookup;

final class InventoryLookupService
{
    /**
     * @return list<array{name:string,code:string,sort_order:int}>
     */
    public function defaultServiceTypes(): array
    {
        $names = ['Consulting', 'Maintenance', 'Marketing', 'Software', 'Support', 'Training', 'Installation', 'Other'];

        return collect($names)->values()->map(fn (string $name, int $index) => [
            'name' => $name,
            'code' => strtolower($name),
            'sort_order' => $index + 1,
        ])->all();
    }

    /**
     * @return \Illuminate\Support\Collection<int,InventoryLookup>
     */
    public function listServiceTypes(?int $tenantId, bool $activeOnly = false)
    {
        try {
            $this->ensureServiceTypeDefaults($tenantId);

            $query = InventoryLookup::query()
                ->where('lookup_type', InventoryLookup::TYPE_SERVICE_TYPE)
                ->orderBy('sort_order')
                ->orderBy('name');

            if ($tenantId) {
                $query->where('tenant_id', $tenantId);
            }

            if ($activeOnly) {
                $query->where('is_active', true);
            }

            return $query->get();
        } catch (\Throwable $e) {
            if ($this->isMissingLookupsTable($e)) {
                return collect();
            }

            throw $e;
        }
    }

    public function ensureServiceTypeDefaults(?int $tenantId): void
    {
        if (! $tenantId) {
            return;
        }

        try {
            $existing = InventoryLookup::query()
                ->where('tenant_id', $tenantId)
                ->where('lookup_type', InventoryLookup::TYPE_SERVICE_TYPE)
                ->count();

            if ($existing > 0) {
                return;
            }

            foreach ($this->defaultServiceTypes() as $row) {
                InventoryLookup::query()->create([
                    'tenant_id' => $tenantId,
                    'lookup_type' => InventoryLookup::TYPE_SERVICE_TYPE,
                    'name' => $row['name'],
                    'code' => $row['code'],
                    'is_active' => true,
                    'sort_order' => $row['sort_order'],
                ]);
            }
        } catch (\Throwable $e) {
            if ($this->isMissingLookupsTable($e)) {
                return;
            }

            throw $e;
        }
    }

    public function rememberServiceType(?int $tenantId, string $name): ?InventoryLookup
    {
        $name = trim($name);
        if ($name === '' || ! $tenantId) {
            return null;
        }

        try {
            $this->ensureServiceTypeDefaults($tenantId);

            $existing = InventoryLookup::query()
                ->where('tenant_id', $tenantId)
                ->where('lookup_type', InventoryLookup::TYPE_SERVICE_TYPE)
                ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
                ->first();

            if ($existing) {
                if (! $existing->is_active) {
                    $existing->update(['is_active' => true]);
                }

                return $existing;
            }

            $maxSort = (int) InventoryLookup::query()
                ->where('tenant_id', $tenantId)
                ->where('lookup_type', InventoryLookup::TYPE_SERVICE_TYPE)
                ->max('sort_order');

            return InventoryLookup::query()->create([
                'tenant_id' => $tenantId,
                'lookup_type' => InventoryLookup::TYPE_SERVICE_TYPE,
                'name' => $name,
                'code' => strtolower(str_replace(' ', '_', $name)),
                'is_active' => true,
                'sort_order' => $maxSort + 1,
            ]);
        } catch (\Throwable $e) {
            if ($this->isMissingLookupsTable($e)) {
                return null;
            }

            $message = strtolower($e->getMessage());
            if (str_contains($message, 'unique') || str_contains($message, 'duplicate')) {
                return null;
            }

            throw $e;
        }
    }

    private function isMissingLookupsTable(\Throwable $e): bool
    {
        $message = strtolower($e->getMessage());

        return str_contains($message, 'inventory_lookups')
            && (
                str_contains($message, 'no such table')
                || str_contains($message, 'base table or view not found')
                || str_contains($message, "doesn't exist")
            );
    }
}
