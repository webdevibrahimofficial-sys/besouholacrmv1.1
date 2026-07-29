<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class WhatsappSetting extends TenantModel
{
    use HasFactory;

    protected $fillable = [
        'tenant_id',
        'provider',
        'api_key',
        'api_secret',
        'business_number',
        'business_id',
        'phone_number_id',
        'business_account_id',
        'webhook_url',
        'status',
        'triggers',
        'auto_replies',
        'auto_create_ctwa_leads',
    ];

    protected $casts = [
        'api_key' => 'encrypted',
        'api_secret' => 'encrypted',
        'status' => 'boolean',
        'triggers' => 'array',
        'auto_replies' => 'array',
        'auto_create_ctwa_leads' => 'boolean',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }
}
