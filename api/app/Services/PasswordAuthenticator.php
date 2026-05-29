<?php

namespace App\Services;

use App\Contracts\AuthenticatorInterface;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

class PasswordAuthenticator implements AuthenticatorInterface
{
    public function verifyCredentials(?User $user, string $password): bool
    {
        if (!$user) {
            // Simulate hashing to avoid timing oracle on user existence
            Hash::check($password, '$2y$12$efCB0r0NzkfDhzYlbQ3UWuLdrjA2HQB0pw1HfABP7I1t80HXIINm.');
            return false;
        }
        return Hash::check($password, $user->password);
    }
}
