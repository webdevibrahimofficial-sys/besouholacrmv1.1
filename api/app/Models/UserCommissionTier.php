<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class UserCommissionTier extends Model
{
    use HasFactory, BelongsToTenant;

    public const SCOPE_PERSONAL = 'personal';
    public const SCOPE_INHERITED = 'inherited';

    protected $fillable = [
        'tenant_id',
        'user_id',
        'year',
        'scope',
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

    public static function normalizeScope(mixed $scope): string
    {
        $value = strtolower(trim((string) $scope));

        return $value === self::SCOPE_INHERITED
            ? self::SCOPE_INHERITED
            : self::SCOPE_PERSONAL;
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
