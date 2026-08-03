<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Spatie\Multitenancy\Models\Concerns\UsesLandlordConnection;

abstract class LandlordModel extends Model
{
    use UsesLandlordConnection;

    protected $connection = 'landlord';
}
