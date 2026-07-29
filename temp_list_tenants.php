<?php
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$tenants = App\Models\Tenant::query()->orderBy('id')->get(['id','name','slug','status']);
echo json_encode($tenants, JSON_PRETTY_PRINT) . PHP_EOL;
