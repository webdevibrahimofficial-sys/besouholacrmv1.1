<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Traits\BelongsToTenant;
use App\Services\TelesalesService;
use Spatie\Activitylog\Traits\LogsActivity;
use Spatie\Activitylog\LogOptions;

class Lead extends Model
{
    use HasFactory, BelongsToTenant, SoftDeletes, LogsActivity;

    // Allow dynamic assignment of any column that exists in the database
    // This is useful for custom fields and future columns
    protected $guarded = ['id', 'created_at', 'updated_at'];
    
    // protected $fillable = [
    //     'tenant_id',
    //     'name',
    //     'email',
    //     'phone',
    //     'company',
    //     'type',
    //     'stage',
    //     'status',
    //     'priority',
    //     'source',
    //     'campaign',
    //     'assigned_to',
    //     'sales_person',
    //     'notes',
    //     'estimated_value',
    //     'attachments',
    //     'deleted_by',
    //     'project',
    //     'project_id',
    //     'item_id',
    //     'created_by',
    //     'location',
    //     'actions_data',
    //     'meta_data',
    //     // Meta Integration Fields
    //     'meta_id',
    //     'campaign_id',
    //     'campaign_id_meta',
    //     'adset_id',
    //     'adset_name',
    //     'ad_id',
    //     'ad_name',
    //     'form_id',
    //     'form_name',
    //     'is_organic',
    //     'platform',
    //     // Google Ads Fields
    //     'gcl_id',
    //     'google_campaign_id',
    //     'google_adgroup_id',
    //     'google_creative_id',
    // ];

    protected $casts = [
        'attachments' => 'array',
        'actions_data' => 'array',
        'meta_data' => 'array',
        'is_organic' => 'boolean',
        'assigned_at' => 'datetime',
        'last_action_at' => 'datetime',
        'last_contact' => 'datetime',
        'workflow_entered_at' => 'datetime',
        'transferred_to_sales_at' => 'datetime',
    ];

    protected $appends = [
        'custom_fields',
    ];

    public function actions()
    {
        return $this->hasMany(LeadAction::class);
    }

    public function stageRelation()
    {
        return $this->belongsTo(Stage::class, 'stage_id');
    }

    public function workflowHistory()
    {
        return $this->hasMany(LeadWorkflowHistory::class, 'lead_id');
    }

    public function latestTransferToSalesHistory()
    {
        return $this->hasOne(LeadWorkflowHistory::class, 'lead_id')
            ->ofMany(['id' => 'max'], function ($query) {
                $query->where('action', 'transfer_to_sales');
            });
    }

    public function latestAction()
    {
        return $this->hasOne(LeadAction::class)->latestOfMany();
    }

    /**
     * Get the custom field values for the lead.
     */
    public function customFieldValues()
    {
        return $this->hasMany(FieldValue::class, 'record_id')
            ->whereHas('field.entity', function ($query) {
                $query->where('key', 'leads');
            });
    }

    public function getCustomFieldsAttribute(): array
    {
        if (!$this->relationLoaded('customFieldValues')) {
            return [];
        }

        return $this->customFieldValues
            ->filter(fn ($fieldValue) => filled($fieldValue?->field?->key))
            ->mapWithKeys(function ($fieldValue) {
                return [$fieldValue->field->key => $fieldValue->value];
            })
            ->all();
    }

    public function getCountryAttribute($value): ?string
    {
        if (filled($value)) {
            return $value;
        }

        $customCountry = $this->custom_fields['country'] ?? null;
        if (filled($customCountry)) {
            return (string) $customCountry;
        }

        $metaCountry = is_array($this->meta_data ?? null) ? ($this->meta_data['country'] ?? null) : null;
        return filled($metaCountry) ? (string) $metaCountry : $value;
    }

    public function referral()
    {
        return $this->hasOne(LeadReferral::class, 'lead_id');
    }

    public function referrals()
    {
        return $this->hasMany(LeadReferral::class, 'lead_id');
    }

    public function referralUsers()
    {
        return $this->belongsToMany(User::class, 'lead_referrals', 'lead_id', 'user_id')
            ->withTimestamps()
            ->withPivot('tenant_id', 'referrer_id');
    }

    public function assignedAgent()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function assignedUser()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function qualifier()
    {
        return $this->belongsTo(User::class, 'qualified_by');
    }

    public function deletedByUser()
    {
        return $this->belongsTo(User::class, 'deleted_by');
    }

    public function campaignRelation()
    {
        return $this->belongsTo(Campaign::class, 'campaign_id');
    }

    public function websiteConnection()
    {
        return $this->belongsTo(WebsiteConnection::class, 'website_connection_id');
    }

    public function getActivitylogOptions(): LogOptions
    {
        return LogOptions::defaults()
            ->logOnly(['stage', 'stage_id', 'workflow_key', 'status', 'assigned_to', 'manager_id', 'name', 'phone', 'email', 'company'])
            ->logOnlyDirty()
            ->dontSubmitEmptyLogs()
            ->setDescriptionForEvent(fn(string $eventName) => "Lead has been {$eventName}");
    }

    protected static function booted(): void
    {
        static::saving(function (Lead $lead) {
            if (!empty($lead->workflow_key) && empty($lead->workflow_entered_at)) {
                $lead->workflow_entered_at = now();
            }

            if (!empty($lead->stage_id)) {
                try {
                    app(TelesalesService::class)->syncLeadStageFields($lead);
                } catch (\Throwable $e) {
                }
            }
        });
    }
}
