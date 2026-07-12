<?php

namespace App\Models;

class SharedUser extends User
{
    protected $table = 'users';

    public function getConnectionName(): ?string
    {
        return config('database.default', 'mysql');
    }
}
