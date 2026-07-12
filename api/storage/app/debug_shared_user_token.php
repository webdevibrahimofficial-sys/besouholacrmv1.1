<?php

require __DIR__ . '/../../vendor/autoload.php';
$app = require __DIR__ . '/../../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$user = App\Models\SharedUser::withoutGlobalScopes()->find(13);

if (! $user) {
    fwrite(STDERR, "User 13 not found\n");
    exit(1);
}

$token = $user->createToken('debug_shared_panel');
echo $token->plainTextToken . PHP_EOL;
