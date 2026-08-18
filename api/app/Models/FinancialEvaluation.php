<?php

namespace App\Models;

use App\Traits\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class FinancialEvaluation extends Model
{
    use BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'user_id',
        'evaluable_type',
        'evaluable_id',
        'input',
        'cash_flows',
        'metrics',
        'decision_payload',
        'assumptions_snapshot',
        'input_source',
        'calculation_trace',
        'policy_version_id',
        'engine_version',
        'decision',
        'status',
    ];

    protected $casts = [
        'input' => 'array',
        'cash_flows' => 'array',
        'metrics' => 'array',
        'decision_payload' => 'array',
        'assumptions_snapshot' => 'array',
        'input_source' => 'array',
        'calculation_trace' => 'array',
    ];

    public function policyVersion(): BelongsTo
    {
        return $this->belongsTo(FinancialPolicyVersion::class, 'policy_version_id');
    }

    public function evaluable(): MorphTo
    {
        return $this->morphTo();
    }
}
