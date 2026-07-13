<?php

namespace App\Models;

use App\Traits\UsesTenantOrSharedConnection;
use Laravel\Sanctum\PersonalAccessToken as SanctumPersonalAccessToken;

class PersonalAccessToken extends SanctumPersonalAccessToken
{
    use UsesTenantOrSharedConnection;
}
