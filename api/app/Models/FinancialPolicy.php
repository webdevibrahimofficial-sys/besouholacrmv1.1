<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinancialPolicy extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'is_active',
        'is_explicitly_configured',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_explicitly_configured' => 'boolean',
    ];

    public function versions(): HasMany
    {
        return $this->hasMany(FinancialPolicyVersion::class, 'policy_id');
    }
}
