<?php
require '/var/www/vendor/autoload.php';
$app = require '/var/www/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$u = App\Models\User::withoutGlobalScopes()->find(1);
$token = $u->createToken('debug_quick_switch');
echo $token->plainTextToken . PHP_EOL;
