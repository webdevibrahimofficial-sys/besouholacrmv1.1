<?php
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$rows = [];
$users = App\Models\User::withoutGlobalScopes()->where('is_super_admin', 1)->orderBy('id')->get();
foreach ($users as $u) {
  if (function_exists('setPermissionsTeamId')) { setPermissionsTeamId($u->tenant_id); }
  $rows[] = [
    'id' => $u->id,
    'email' => $u->email,
    'tenant_id' => $u->tenant_id,
    'status' => $u->status,
    'role' => $u->roles->pluck('name')->first(),
    'can_impersonate' => $u->can('system.tenants.impersonate'),
  ];
}
echo json_encode($rows, JSON_PRETTY_PRINT) . PHP_EOL;
