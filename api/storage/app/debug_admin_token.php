<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$user = App\Models\User::withoutGlobalScopes()->find(1);
$token = $user->createToken('debug_admin_panel');
echo $token->plainTextToken . PHP_EOL;
