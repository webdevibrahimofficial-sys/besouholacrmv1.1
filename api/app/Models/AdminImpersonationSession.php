<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Laravel\Sanctum\PersonalAccessToken;

class AdminImpersonationSession extends Model
{
    protected $connection = 'landlord';

    protected $fillable = [
        'admin_user_id',
        'tenant_id',
        'tenant_user_id',
        'mode',
        'reason',
        'token_hash',
        'bridge_token_used_at',
        'support_session_token_id',
        'status',
        'started_at',
        'last_seen_at',
        'expires_at',
        'ended_at',
        'ended_by',
        'ended_reason',
        'revoked_at',
        'ip_address',
        'user_agent',
        'origin_panel',
        'meta_data',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'expires_at' => 'datetime',
        'ended_at' => 'datetime',
        'revoked_at' => 'datetime',
        'bridge_token_used_at' => 'datetime',
        'meta_data' => 'array',
    ];

    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_user_id');
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    public function tenantUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'tenant_user_id');
    }

    public function supportSessionToken(): BelongsTo
    {
        return $this->belongsTo(PersonalAccessToken::class, 'support_session_token_id');
    }

    public function isActive(): bool
    {
        return $this->status === 'active' && !$this->revoked_at && !$this->ended_at && $this->expires_at?->isFuture();
    }
}
