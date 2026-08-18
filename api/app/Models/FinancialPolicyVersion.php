<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinancialPolicyVersion extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'policy_id',
        'version',
        'thresholds',
        'created_by_id',
    ];

    protected $casts = [
        'thresholds' => 'array',
        'version' => 'integer',
    ];

    public function policy(): BelongsTo
    {
        return $this->belongsTo(FinancialPolicy::class, 'policy_id');
    }
}
