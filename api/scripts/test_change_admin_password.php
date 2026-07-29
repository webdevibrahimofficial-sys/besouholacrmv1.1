<?php
// Small script to test changing a tenant admin password and verifying credentials
require __DIR__ . '/../vendor/autoload.php';
$app = require_once __DIR__ . '/../bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

$tenant = Tenant::first();
if (!$tenant) {
    echo "No tenants found\n";
    exit(1);
}

$owner = User::withoutGlobalScopes()->where('tenant_id', $tenant->id)->orderBy('id')->first();
if (!$owner) {
    echo "No owner user found for tenant {$tenant->id}\n";
    exit(1);
}

$originalHash = $owner->password;
$newPassword = 'TestPass123!';

try {
    $owner->password = Hash::make($newPassword);
    $owner->save();

    // Use the app's authenticator to verify
    $authOk = app(\App\Contracts\AuthenticatorInterface::class)->verifyCredentials($owner, $newPassword);

    echo "Changed password for user {$owner->email}. Verification result: ";
    echo $authOk ? "SUCCESS\n" : "FAIL\n";

    // Revert password
    $owner->password = $originalHash;
    $owner->save();
    echo "Password reverted.\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    // Attempt revert
    $owner->password = $originalHash;
    $owner->save();
}
