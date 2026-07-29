<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Notifications\DatabaseNotification;

class SharedUser extends User
{
    protected $table = 'users';

    public function getConnectionName(): ?string
    {
        return config('database.default', 'mysql');
    }

    /**
     * Shared users historically received notifications under App\Models\User.
     * Read both morph types so demo/shared logins can still see existing records.
     */
    public function notifications(): HasMany
    {
        return $this->hasMany(DatabaseNotification::class, 'notifiable_id')
            ->whereIn('notifiable_type', $this->notificationMorphTypes());
    }

    public function readNotifications(): HasMany
    {
        return $this->notifications()->whereNotNull('read_at');
    }

    public function unreadNotifications(): HasMany
    {
        return $this->notifications()->whereNull('read_at');
    }

    protected function notificationMorphTypes(): array
    {
        return array_values(array_unique([
            User::class,
            static::class,
        ]));
    }
}
