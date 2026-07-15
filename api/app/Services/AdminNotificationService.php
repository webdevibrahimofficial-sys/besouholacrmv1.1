<?php

namespace App\Services;

use App\Data\AdminNotificationPayload;
use App\Jobs\SendAdminNotificationEmailJob;
use App\Jobs\SendAdminPushNotificationJob;
use App\Models\AdminNotification;
use App\Models\AdminNotificationSetting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class AdminNotificationService
{
    /**
     * @return Collection<int, AdminNotification>
     */
    public function notify(AdminNotificationPayload $payload, ?Collection $targets = null): Collection
    {
        if (! config('features.admin_notifications_v1')) {
            return collect();
        }

        $admins = $targets ?: User::withoutGlobalScopes()
            ->where('is_super_admin', true)
            ->get();

        $created = collect();

        foreach ($admins as $admin) {
            if (! $admin->is_super_admin) {
                continue;
            }

            $settings = AdminNotificationSetting::firstOrCreate(
                ['admin_user_id' => $admin->id],
                [
                    'in_app_enabled' => true,
                    'email_enabled' => false,
                    'push_enabled' => false,
                ]
            );

            if ($this->isSuppressedByPreferences($payload, $settings)) {
                continue;
            }

            if ($this->isDuplicate($admin->id, $payload->dedupeKey, $payload->dedupeWindowMinutes)) {
                continue;
            }

            $notification = AdminNotification::create([
                'id' => (string) Str::uuid(),
                'admin_user_id' => $admin->id,
                'related_tenant_id' => $payload->relatedTenantId,
                'type' => $payload->type,
                'title' => $payload->title,
                'body' => $payload->body,
                'category' => $payload->category,
                'severity' => $payload->severity,
                'source' => $payload->source,
                'dedupe_key' => $payload->dedupeKey,
                'action_url' => $payload->actionUrl,
                'data' => array_merge($payload->data, array_filter([
                    'title_ar' => $payload->titleAr,
                    'body_ar' => $payload->bodyAr,
                ], fn ($value) => $value !== null && $value !== '')),
            ]);

            $created->push($notification);

            if (in_array('email', $payload->channels, true) && $settings->email_enabled) {
                SendAdminNotificationEmailJob::dispatch($notification->id);
            }

            if (in_array('push', $payload->channels, true) && $settings->push_enabled) {
                SendAdminPushNotificationJob::dispatch($notification->id);
            }
        }

        return $created;
    }

    protected function isDuplicate(int $adminUserId, ?string $dedupeKey, int $windowMinutes = 15): bool
    {
        if (! $dedupeKey) {
            return false;
        }

        return AdminNotification::query()
            ->where('admin_user_id', $adminUserId)
            ->where('dedupe_key', $dedupeKey)
            ->where('created_at', '>=', now()->subMinutes(max(1, $windowMinutes)))
            ->exists();
    }

    protected function isSuppressedByPreferences(AdminNotificationPayload $payload, AdminNotificationSetting $settings): bool
    {
        if ($settings->quiet_hours_enabled && $settings->quiet_hours_start && $settings->quiet_hours_end) {
            $now = Carbon::now()->format('H:i');
            $start = $settings->quiet_hours_start;
            $end = $settings->quiet_hours_end;
            $inWindow = $start <= $end
                ? ($now >= $start && $now <= $end)
                : ($now >= $start || $now <= $end);
            if ($inWindow) {
                return true;
            }
        }

        $categoryPrefs = (array) ($settings->category_preferences ?? []);
        if (array_key_exists($payload->category, $categoryPrefs) && $categoryPrefs[$payload->category] === false) {
            return true;
        }

        $severityPrefs = (array) ($settings->severity_preferences ?? []);
        if (array_key_exists($payload->severity, $severityPrefs) && $severityPrefs[$payload->severity] === false) {
            return true;
        }

        return false;
    }
}
