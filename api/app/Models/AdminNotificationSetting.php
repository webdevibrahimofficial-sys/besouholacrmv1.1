<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AdminNotificationSetting extends Model
{
    use HasFactory;

    protected $fillable = [
        'admin_user_id',
        'in_app_enabled',
        'email_enabled',
        'push_enabled',
        'quiet_hours_enabled',
        'quiet_hours_start',
        'quiet_hours_end',
        'category_preferences',
        'severity_preferences',
        'meta_data',
    ];

    protected $casts = [
        'in_app_enabled' => 'boolean',
        'email_enabled' => 'boolean',
        'push_enabled' => 'boolean',
        'quiet_hours_enabled' => 'boolean',
        'category_preferences' => 'array',
        'severity_preferences' => 'array',
        'meta_data' => 'array',
    ];

    public function adminUser()
    {
        return $this->belongsTo(User::class, 'admin_user_id');
    }
}

