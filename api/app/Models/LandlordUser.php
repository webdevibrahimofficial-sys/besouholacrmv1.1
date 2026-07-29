<?php

namespace App\Models;

class LandlordUser extends User
{
    protected $table = 'users';

    public function getConnectionName(): ?string
    {
        return config('multitenancy.landlord_database_connection_name', 'landlord');
    }
}
