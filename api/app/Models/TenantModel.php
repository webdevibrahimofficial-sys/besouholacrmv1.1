<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\UsesTenantOrSharedConnection;

abstract class TenantModel extends Model
{
    use UsesTenantOrSharedConnection;
}
