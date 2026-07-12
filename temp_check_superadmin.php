<?php
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$u = App\Models\User::withoutGlobalScopes()->where('is_super_admin', 1)->orderBy('id')->first();
if (!$u) { echo "no-user\n"; exit(0); }
if (function_exists('setPermissionsTeamId')) { setPermissionsTeamId($u->tenant_id); }
echo json_encode([
  'id' => $u->id,
  'email' => $u->email,
  'tenant_id' => $u->tenant_id,
  'is_super_admin' => (bool) $u->is_super_admin,
  'can_impersonate' => $u->can('system.tenants.impersonate'),
  'roles' => $u->roles->pluck('name')->values()->all(),
  'permissions' => $u->getAllPermissions()->pluck('name')->values()->all(),
], JSON_PRETTY_PRINT) . PHP_EOL;
