<?php

namespace App\Services;

use App\Models\Tenant;
use App\Models\TenantSubscriptionContract;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class TenantSubscriptionContractService
{
    public function createContract(Tenant $tenant, array $data, ?User $actor): TenantSubscriptionContract
    {
        return DB::transaction(function () use ($tenant, $data, $actor) {
            $effectiveFrom = $data['effective_from'];

            $tenant->subscriptionContracts()
                ->whereNull('effective_to')
                ->update(['effective_to' => $effectiveFrom]);

            return $tenant->subscriptionContracts()->create([
                ...$data,
                'created_by' => $actor?->id,
            ]);
        });
    }

    public function currentContract(Tenant $tenant): ?TenantSubscriptionContract
    {
        return $tenant->subscriptionContracts()
            ->whereNull('effective_to')
            ->latest('effective_from')
            ->first();
    }
}
