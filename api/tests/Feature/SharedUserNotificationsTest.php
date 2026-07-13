<?php

namespace Tests\Feature;

use App\Models\SharedUser;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SharedUserNotificationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_shared_user_can_read_notifications_stored_under_user_morph_type(): void
    {
        $user = User::factory()->create([
            'email' => 'demo@example.com',
        ]);

        DB::table('notifications')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'type' => 'App\\Notifications\\TestNotification',
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'data' => json_encode([
                'title' => 'Legacy notification',
                'message' => 'Stored using the base user morph type.',
            ], JSON_THROW_ON_ERROR),
            'read_at' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $sharedUser = SharedUser::query()->findOrFail($user->id);
        Sanctum::actingAs($sharedUser);

        $this->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonPath('unread_count', 1)
            ->assertJsonCount(1, 'notifications.data')
            ->assertJsonPath('notifications.data.0.data.title', 'Legacy notification');
    }
}
