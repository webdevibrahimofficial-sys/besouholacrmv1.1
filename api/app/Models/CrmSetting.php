<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToTenant;
use Illuminate\Support\Facades\Schema;

class CrmSetting extends Model
{
    use HasFactory, BelongsToTenant;

    protected $fillable = [
        'tenant_id',
        'settings',
    ];

    protected $casts = [
        'settings' => 'array',
    ];

    /**
     * Canonical CRM setting defaults (UI + runtime must agree).
     */
    public static function defaults(): array
    {
        return [
            'requestApprovals' => false,
            'duplicationSystem' => true,
            'allowDuplicateProjects' => false,
            'allowDuplicateProperties' => false,
            'allowCustomerPaymentPlan' => true,
            'showBroker' => true,
            'showDeveloper' => true,
            'showColdCallsStage' => true,
            'showMobileNumber' => true,
            'startUnitCode' => '0001',
            'startCustomerCode' => '0001',
            'startInvoiceCode' => '0001',
            'startOrderCode' => '0001',
            'startQuotationCode' => '0001',
            'allowConvertToCustomers' => true,
            'enableTwoFactorAuth' => false,
            'defaultCountryCode' => 'EG',
            'defaultCurrency' => 'EGP',
            'timeZone' => 'Africa/Cairo',
            'dateFormat' => 'DD/MM/YYYY',
            'timeFormat' => '24h',
            'numberFormat' => '1,234.56',
            'animations' => true,
            'sidebarCollapsible' => true,
            'allowTimeline' => true,
            'allowCallLog' => true,
            'allowChatbot' => false,

            // Reservation hold time in hours. null/empty = lifetime (no auto-expiry)
            'reservationHoldHours' => null,

            // Integration lead defaults (Meta / Google Ads, etc.)
            'integrationDefaultStage' => 'New Lead',
            'integrationDefaultProjectId' => null,
            'integrationDefaultItemId' => null,
            'salesEntryStageIdForTransferredLeads' => null,
            'defaultWorkflowFallback' => 'sales',
            'leadWorkflowSourceMappings' => [],
        ];
    }

    /**
     * Merge stored tenant settings on top of defaults.
     */
    public static function resolved(?self $record = null): array
    {
        try {
            if (! Schema::hasTable((new static)->getTable())) {
                return static::defaults();
            }
        } catch (\Throwable) {
            return static::defaults();
        }

        $record ??= static::query()->first();
        $stored = is_array($record?->settings) ? $record->settings : [];

        return array_merge(static::defaults(), $stored);
    }

    /**
     * Read a single setting with defaults applied.
     */
    public static function flag(string $key, mixed $default = null): mixed
    {
        $settings = static::resolved();
        if (array_key_exists($key, $settings)) {
            return $settings[$key];
        }

        return $default;
    }

    public static function isDuplicationEnabled(): bool
    {
        return (bool) static::flag('duplicationSystem', true);
    }

    /**
     * Ensure a crm_settings row exists with defaults merged in.
     * Fixes new tenants where the UI shows defaults but nothing is persisted yet.
     */
    public static function ensureInitialized(?int $tenantId = null): self
    {
        $query = static::query();
        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $record = $query->first();
        $merged = static::defaults();

        if ($record) {
            $stored = is_array($record->settings) ? $record->settings : [];
            $merged = array_merge($merged, $stored);
            if ($record->settings !== $merged) {
                $record->settings = $merged;
                $record->save();
            }

            return $record;
        }

        $record = new static();
        if ($tenantId) {
            $record->tenant_id = $tenantId;
        } elseif (app()->bound('current_tenant_id') && app('current_tenant_id')) {
            $record->tenant_id = (int) app('current_tenant_id');
        }
        $record->settings = $merged;
        $record->save();

        return $record;
    }
}
