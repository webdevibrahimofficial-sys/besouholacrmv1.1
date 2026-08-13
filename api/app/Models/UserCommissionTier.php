<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class UserCommissionTier extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'user_id',
        'year',
        'from_percentage',
        'to_percentage',
        'commission_percentage',
    ];

    protected function casts(): array
    {
        return [
            'year' => 'integer',
            'from_percentage' => 'decimal:2',
            'to_percentage' => 'decimal:2',
            'commission_percentage' => 'decimal:2',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
