<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WhatsappChannel extends TenantModel
{
    use HasFactory;

    public const PROVIDER_MIRROR = 'mirror';

    public const PROVIDER_META_CLOUD = 'meta_cloud';

    public const STATUS_PENDING = 'pending';

    public const STATUS_CONNECTING = 'connecting';

    public const STATUS_CONNECTED = 'connected';

    public const STATUS_DISCONNECTED = 'disconnected';

    public const STATUS_ERROR = 'error';

    public const STATUS_MIGRATING = 'migrating';

    public const STATUS_ARCHIVED = 'archived';

    public const ACTIVE_STATUSES = [
        self::STATUS_CONNECTING,
        self::STATUS_CONNECTED,
        self::STATUS_MIGRATING,
    ];

    protected $fillable = [
        'tenant_id',
        'provider',
        'display_name',
        'phone_number',
        'normalized_phone',
        'phone_number_id',
        'business_account_id',
        'mirror_session_id',
        'access_token',
        'status',
        'is_primary',
        'supports_inbound',
        'supports_outbound',
        'supports_ctwa_attribution',
        'last_connected_at',
        'last_disconnected_at',
        'last_error',
        'connected_by_user_id',
        'metadata',
    ];

    protected $casts = [
        'is_primary' => 'boolean',
        'supports_inbound' => 'boolean',
        'supports_outbound' => 'boolean',
        'supports_ctwa_attribution' => 'boolean',
        'last_connected_at' => 'datetime',
        'last_disconnected_at' => 'datetime',
        'metadata' => 'array',
        'access_token' => 'encrypted',
    ];

    protected $hidden = [
        'access_token',
    ];

    public function mirrorSession(): BelongsTo
    {
        return $this->belongsTo(WhatsappMirrorSession::class, 'mirror_session_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(WhatsappMessage::class, 'channel_id');
    }

    public function isActive(): bool
    {
        return in_array($this->status, self::ACTIVE_STATUSES, true);
    }

    public function canSendOutbound(): bool
    {
        return $this->supports_outbound
            && in_array($this->status, [self::STATUS_CONNECTED, self::STATUS_MIGRATING], true);
    }
}
