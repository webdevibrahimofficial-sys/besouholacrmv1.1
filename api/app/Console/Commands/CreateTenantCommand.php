<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\TenantBootstrapper;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class CreateTenantCommand extends Command
{
    protected $signature = 'tenants:create {--name=} {--domain=} {--slug=} {--type=shared} {--admin-name=} {--admin-email=} {--admin-password=}';

    protected $description = 'Create a new tenant (shared or dedicated) in landlord database';

    protected TenantBootstrapper $bootstrapper;

    public function __construct(TenantBootstrapper $bootstrapper)
    {
        parent::__construct();
        $this->bootstrapper = $bootstrapper;
    }

    public function handle(): int
    {
        $name = $this->option('name') ?: $this->ask('Tenant name');
        $domain = $this->option('domain') ?: $this->ask('Tenant domain (e.g. client.example.com)');
        $slug = $this->option('slug') ?: Str::slug(strtok((string) $domain, '.'));
        $type = $this->option('type') ?: 'shared';

        $adminName = $this->option('admin-name');
        $adminEmail = $this->option('admin-email');
        $adminPassword = $this->option('admin-password');

        $adminData = null;
        if ($adminName && $adminEmail && $adminPassword) {
            $adminData = [
                'name' => $adminName,
                'email' => $adminEmail,
                'password' => $adminPassword,
            ];
        }

        if (!in_array($type, ['shared', 'dedicated'], true)) {
            $this->error("Invalid type '{$type}'. Allowed: shared, dedicated.");
            return self::FAILURE;
        }

        try {
            $tenant = new Tenant();
            $tenant->setConnection('landlord');
            $tenant->name = $name;
            $tenant->slug = $slug;
            $tenant->domain = $domain;
            $tenant->status = 'active';
            $tenant->tenancy_type = $type;
            $tenant->subscription_plan = $tenant->subscription_plan ?? 'core';
            $tenant->saveQuietly();

            if ($type === 'dedicated') {
                $landlordConnection = config('multitenancy.landlord_database_connection_name', 'landlord');
                $dbHost = config("database.connections.{$landlordConnection}.host");
                $dbPort = config("database.connections.{$landlordConnection}.port");

                $databaseName = 'tenant_' . $tenant->id . '_' . Str::random(6);
                $username = 'tenant_' . $tenant->id . '_' . Str::lower(Str::random(4));
                $password = Str::random(32);

                $dbDetails = [
                    'driver' => 'mysql',
                    'host' => $dbHost,
                    'port' => $dbPort,
                    'database' => $databaseName,
                    'username' => $username,
                    'password' => $password,
                ];

                $this->info("Creating dedicated database '{$databaseName}' and user '{$username}'...");

                $landlordDb = DB::connection($landlordConnection);
                $landlordDb->statement("CREATE DATABASE `{$databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
                $landlordDb->statement("CREATE USER '{$username}'@'%' IDENTIFIED BY '{$password}'");
                $landlordDb->statement("GRANT ALL PRIVILEGES ON `{$databaseName}`.* TO '{$username}'@'%'");
                $landlordDb->statement('FLUSH PRIVILEGES');

                $tenant->db_connection_details = $dbDetails;
                $tenant->saveQuietly();

                $connectionName = 'tenant-dedicated';

                Config::set("database.connections.{$connectionName}", array_merge(
                    Config::get("database.connections.tenant-dedicated", []),
                    $dbDetails
                ));
                Config::set('webpush.database_connection', $connectionName);

                DB::purge($connectionName);

                $migrateExitCode = Artisan::call('migrate', [
                    '--database' => $connectionName,
                    '--force' => true,
                ]);

                if ($migrateExitCode !== 0) {
                    throw new \RuntimeException('Dedicated tenant migrations failed: ' . trim(Artisan::output()));
                }

                $this->syncTenantRecordToDedicatedDatabase($tenant, $connectionName);
            }

            if ($adminData) {
                $this->bootstrapper->bootstrap($tenant, $adminData);
            }

            $this->info("Tenant [{$tenant->id}] created successfully.");
            $this->line(" - Name: {$tenant->name}");
            $this->line(" - Domain: {$tenant->domain}");
            $this->line(" - Slug: {$tenant->slug}");
            $this->line(" - Type: {$tenant->tenancy_type}");

            return self::SUCCESS;
        } catch (\Throwable $e) {
            $this->error('Failed to create tenant: ' . $e->getMessage());
            return self::FAILURE;
        }
    }

    protected function syncTenantRecordToDedicatedDatabase(Tenant $tenant, string $connectionName): void
    {
        if (!Schema::connection($connectionName)->hasTable('tenants')) {
            return;
        }

        $columns = Schema::connection($connectionName)->getColumnListing('tenants');
        $timestamp = now();

        $payload = [
            'id' => $tenant->id,
            'name' => $tenant->name,
            'domain' => $tenant->domain,
            'slug' => $tenant->slug,
            'status' => $tenant->status,
            'subscription_plan' => $tenant->subscription_plan,
            'company_type' => $tenant->company_type,
            'users_limit' => $tenant->users_limit,
            'start_date' => optional($tenant->start_date)->toDateString(),
            'end_date' => optional($tenant->end_date)->toDateString(),
            'country' => $tenant->country,
            'city' => $tenant->city,
            'state' => $tenant->state,
            'address_line_1' => $tenant->address_line_1,
            'address_line_2' => $tenant->address_line_2,
            'tenancy_type' => $tenant->tenancy_type,
            'website_url' => $tenant->website_url,
            'profile' => $tenant->profile ? json_encode($tenant->profile) : null,
            'db_connection_details' => $tenant->db_connection_details ? json_encode($tenant->db_connection_details) : null,
            'meta_data' => $tenant->meta_data ? json_encode($tenant->meta_data) : null,
            'created_at' => $tenant->created_at ?? $timestamp,
            'updated_at' => $timestamp,
        ];

        $filteredPayload = array_intersect_key($payload, array_flip($columns));

        DB::connection($connectionName)->table('tenants')->updateOrInsert(
            ['id' => $tenant->id],
            $filteredPayload
        );
    }
}
