<?php

namespace App\Models;

use App\Models\Tenant;
use Spatie\Activitylog\Models\Activity as SpatieActivity;
use App\Models\Scopes\TenantActivityScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Spatie\Multitenancy\Models\Concerns\UsesTenantConnection;
use Spatie\Multitenancy\Models\Concerns\UsesLandlordConnection;

class Activity extends SpatieActivity
{
    use UsesTenantConnection;
    use UsesLandlordConnection;

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

    public function getConnectionName()
    {
        if ($this->shouldUseLandlordConnection()) {
            return $this->landlordDatabaseConnectionName();
        }

        return $this->resolveTenantActivityConnectionName();
    }

    protected function resolveTenantActivityConnectionName(): string
    {
        $tenantConnection = $this->tenantDatabaseConnectionName();
        $tenantConfig = config("database.connections.{$tenantConnection}", []);

        if ($this->connectionConfigLooksUsable($tenantConfig)) {
            return $tenantConnection;
        }

        return (string) config('database.default', 'mysql');
    }

    protected function connectionConfigLooksUsable(array $config): bool
    {
        $driver = (string) ($config['driver'] ?? '');
        if ($driver === 'sqlite') {
            return !empty($config['database']);
        }

        if (!empty($config['url']) || !empty($config['unix_socket'])) {
            return true;
        }

        return !empty($config['host']) && !empty($config['database']) && !empty($config['username']);
    }

    protected function shouldUseLandlordConnection(): bool
    {
        // This method is called while Eloquent is resolving the model's
        // connection. Reading attributes through magic properties here can
        // recurse back into getConnectionName(), so only inspect the raw
        // attribute array.
        $attributes = $this->attributes;
        $logName = $attributes['log_name'] ?? null;
        $subjectType = $attributes['subject_type'] ?? null;

        if ($logName === 'super_admin') {
            return true;
        }

        if ($subjectType === Tenant::class) {
            return true;
        }

        // Relationship loading can happen before subject_type is populated.
        if ($subjectType === null) {
            return true;
        }

        $currentTenantKey = config('multitenancy.current_tenant_container_key', 'currentTenant');
        $hasCurrentTenant = (app()->bound($currentTenantKey) && app($currentTenantKey))
            || (app()->bound('tenant') && app('tenant'));

        return !$hasCurrentTenant;
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
