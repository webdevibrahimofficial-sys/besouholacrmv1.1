<?php

namespace App\Multitenancy\Tasks;

use App\Models\Tenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Spatie\Multitenancy\Concerns\UsesMultitenancyConfig;
use Spatie\Multitenancy\Contracts\IsTenant;
use Spatie\Multitenancy\Exceptions\InvalidConfiguration;
use Spatie\Multitenancy\Tasks\SwitchTenantTask;

class SwitchTenantDatabaseTask implements SwitchTenantTask
{
    use UsesMultitenancyConfig;

    protected ?array $tenantTemplate = null;

    protected ?array $sharedTemplate = null;

    public function makeCurrent(IsTenant $tenant): void
    {
        $this->setTenantConnectionConfig($tenant);
    }

    public function forgetCurrent(): void
    {
        $this->resetTenantConnectionConfig();
    }

    protected function setTenantConnectionConfig(IsTenant $tenant): void
    {
        $tenantConnectionName = $this->tenantDatabaseConnectionName();

        if ($tenantConnectionName === $this->landlordDatabaseConnectionName()) {
            throw InvalidConfiguration::tenantConnectionIsEmptyOrEqualsToLandlordConnection();
        }

        if (is_null(config("database.connections.{$tenantConnectionName}"))) {
            throw InvalidConfiguration::tenantConnectionDoesNotExist($tenantConnectionName);
        }

        $config = $this->baseTenantConnectionConfig();

        if ($tenant instanceof Tenant && $tenant->tenancy_type === 'dedicated') {
            $details = is_array($tenant->db_connection_details) ? $tenant->db_connection_details : [];

            $config = array_merge($config, array_filter([
                'driver' => $details['driver'] ?? null,
                'host' => $details['host'] ?? null,
                'port' => $details['port'] ?? null,
                'database' => $details['database'] ?? null,
                'username' => $details['username'] ?? null,
                'password' => $details['password'] ?? null,
                'unix_socket' => $details['unix_socket'] ?? null,
            ], static fn ($value) => $value !== null && $value !== ''));
        }

        $config['database'] = $tenant->getDatabaseName();

        $this->applyTenantConnectionConfig($tenantConnectionName, $config);
    }

    protected function resetTenantConnectionConfig(): void
    {
        $this->applyTenantConnectionConfig(
            $this->tenantDatabaseConnectionName(),
            $this->baseTenantConnectionConfig()
        );
    }

    protected function baseTenantConnectionConfig(): array
    {
        if ($this->tenantTemplate === null) {
            $this->tenantTemplate = array_filter(
                config("database.connections.{$this->tenantDatabaseConnectionName()}", []),
                static fn ($value) => $value !== null
            );
        }

        if ($this->sharedTemplate === null) {
            $this->sharedTemplate = config('database.connections.mysql', []);
        }

        return array_merge($this->sharedTemplate, $this->tenantTemplate);
    }

    protected function applyTenantConnectionConfig(string $connectionName, array $config): void
    {
        config([
            "database.connections.{$connectionName}" => $config,
        ]);

        app('db')->extend($connectionName, function ($connectionConfig, $name) use ($config) {
            return app('db.factory')->make($config, $name);
        });

        DB::purge($connectionName);
        Model::setConnectionResolver(app('db'));
    }
}
