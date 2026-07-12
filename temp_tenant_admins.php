<?php
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$service = app(App\Services\AdminImpersonationService::class);
$rows = [];
foreach (App\Models\Tenant::query()->orderBy('id')->get() as $tenant) {
    $ref = new ReflectionClass($service);
    $method = $ref->getMethod('resolvePrimaryTenantUser');
    $method->setAccessible(true);
    $tenantAdmin = $method->invoke($service, $tenant);
    $rows[] = [
        'id' => $tenant->id,
        'name' => $tenant->name,
        'slug' => $tenant->slug,
        'status' => $tenant->status,
        'archived_at' => $tenant->archived_at,
        'tenant_admin_email' => $tenantAdmin?->email,
        'tenant_admin_name' => $tenantAdmin?->name,
        'tenant_admin_id' => $tenantAdmin?->id,
    ];
}
echo json_encode($rows, JSON_PRETTY_PRINT) . PHP_EOL;
