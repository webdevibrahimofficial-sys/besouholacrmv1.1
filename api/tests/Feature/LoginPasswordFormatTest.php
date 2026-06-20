<?php

namespace Tests\Feature;

use App\Services\PasswordAuthenticator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LoginPasswordFormatTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_with_legacy_password_format_returns_unauthorized_instead_of_500(): void
    {
        $userId = DB::table('users')->insertGetId([
            'name' => 'Legacy User',
            'email' => 'legacy@example.com',
            'password' => '/e.RSouZD3FheYyl.Gan1bWgpKxkqB6Tm',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->postJson('/api/login', [
            'email' => 'legacy@example.com',
            'password' => '12345678',
        ]);

        $response->assertStatus(401)
            ->assertJson(['message' => 'Invalid credentials']);

        $this->assertDatabaseHas('users', [
            'id' => $userId,
            'email' => 'legacy@example.com',
        ]);
    }

    public function test_password_authenticator_accepts_valid_bcrypt_hashes(): void
    {
        $user = User::factory()->create([
            'password' => bcrypt('secret-password'),
        ]);

        $authenticator = app(PasswordAuthenticator::class);

        $this->assertTrue($authenticator->verifyCredentials($user, 'secret-password'));
    }
}
