<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SubscriptionTransaction extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'contract_id',
        'type',
        'status',
        'currency',
        'total_amount',
        'payment_method',
        'source',
        'gateway_provider',
        'gateway_reference',
        'period_start',
        'period_end',
        'notes',
        'attachment_path',
        'created_by',
    ];

    protected $casts = [
        'total_amount' => 'decimal:2',
        'period_start' => 'date',
        'period_end' => 'date',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function contract()
    {
        return $this->belongsTo(TenantSubscriptionContract::class, 'contract_id');
    }

    public function items()
    {
        return $this->hasMany(SubscriptionTransactionItem::class, 'transaction_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeActive($query)
    {
        return $query->where('status', '!=', 'void');
    }

    public function markVoid(?string $reason = null): void
    {
        $notes = trim(implode("\n\n", array_filter([
            (string) $this->notes,
            $reason ? 'Void reason: ' . $reason : null,
        ])));

        $this->forceFill([
            'status' => 'void',
            'notes' => $notes ?: null,
        ])->save();
    }
}
