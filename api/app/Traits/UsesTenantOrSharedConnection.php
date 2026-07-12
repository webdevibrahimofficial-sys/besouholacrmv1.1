<?php

namespace App\Traits;

trait UsesTenantOrSharedConnection
{
    public function getConnectionName(): ?string
    {
        if (app()->bound('tenant') && app('tenant') && app('tenant')->tenancy_type === 'dedicated') {
            return config('multitenancy.tenant_database_connection_name', 'tenant-dedicated');
        }

        return config('database.default', 'mysql');
    }
}
