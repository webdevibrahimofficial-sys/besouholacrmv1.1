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

        $storedPassword = (string) $user->password;

        try {
            if (Hash::check($password, $storedPassword)) {
                return true;
            }
        } catch (\Throwable $e) {
            // Fall through to legacy password formats below.
        }

        $hashInfo = password_get_info($storedPassword);
        if (($hashInfo['algo'] ?? 0) !== 0) {
            if (password_verify($password, $storedPassword)) {
                if (password_needs_rehash($storedPassword, PASSWORD_BCRYPT)) {
                    $user->forceFill(['password' => $password])->save();
                }

                return true;
            }

            return false;
        }

        if (hash_equals($storedPassword, $password)) {
            $user->forceFill(['password' => $password])->save();

            return true;
        }

        return false;
    }
}
