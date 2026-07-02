<?php

namespace App\Models;

use App\Models\Tenant;
use Spatie\Activitylog\Models\Activity as SpatieActivity;
use App\Models\Scopes\TenantActivityScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

class Activity extends SpatieActivity
{
    protected $fillable = [
        'log_name',
        'description',
        'subject_type',
        'event',
        'subject_id',
        'causer_type',
        'causer_id',
        'properties',
        'batch_uuid',
        'tenant_id',
    ];

    /**
     * The "booted" method of the model.
     *
     * @return void
     */
    protected static function booted()
    {
        static::addGlobalScope(new TenantActivityScope);

        static::creating(function ($activity) {
            // Automatically set tenant_id if not already set
            if (empty($activity->tenant_id)) {
                $activity->tenant_id = static::resolveTenantIdForActivity($activity);
            }
        });
    }

    protected static function resolveTenantIdForActivity(self $activity): ?int
    {
        $propertiesTenantId = data_get($activity->properties, 'tenant_id');
        if ($propertiesTenantId) {
            return (int) $propertiesTenantId;
        }

        $subjectTenantId = static::resolveTenantIdFromSubject($activity);
        if ($subjectTenantId) {
            return $subjectTenantId;
        }

        if (Auth::check() && Auth::user()->tenant_id) {
            return (int) Auth::user()->tenant_id;
        }

        return null;
    }

    protected static function resolveTenantIdFromSubject(self $activity): ?int
    {
        $subject = $activity->subject;
        if ($subject instanceof Tenant) {
            return (int) $subject->getKey();
        }

        if ($subject instanceof Model && !empty($subject->tenant_id)) {
            return (int) $subject->tenant_id;
        }

        if ($activity->subject_type === Tenant::class && !empty($activity->subject_id)) {
            return (int) $activity->subject_id;
        }

        if (!empty($activity->subject_type) && !empty($activity->subject_id) && class_exists($activity->subject_type)) {
            try {
                $subjectModel = $activity->subject_type::query()->find($activity->subject_id);
                if ($subjectModel instanceof Tenant) {
                    return (int) $subjectModel->getKey();
                }

                if ($subjectModel instanceof Model && !empty($subjectModel->tenant_id)) {
                    return (int) $subjectModel->tenant_id;
                }
            } catch (\Throwable $e) {
                return null;
            }
        }

        return null;
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }
}
