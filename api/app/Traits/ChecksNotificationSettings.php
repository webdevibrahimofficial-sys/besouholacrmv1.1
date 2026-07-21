<?php

namespace App\Traits;

use App\Models\NotificationSetting;
use Carbon\Carbon;
use NotificationChannels\WebPush\WebPushChannel;
use NotificationChannels\WebPush\WebPushMessage;

trait ChecksNotificationSettings
{
    protected function notificationPreferenceContext(): ?array
    {
        return null;
    }

    /**
     * Determine which channels to send to based on user settings.
     *
     * @param object $notifiable
     * @param array $availableChannels The channels this notification supports (e.g. ['mail', 'database'])
     * @param string|null $securityKey The specific security setting key to check (e.g. 'password_change_alert')
     * @return array
     */
    public function determineChannels($notifiable, array $availableChannels, $securityKey = null)
    {
        // Default to all available if notifiable is not a User or has no settings
        if (!method_exists($notifiable, 'getAttribute')) {
            return $availableChannels;
        }

        $notifSettings = $notifiable->notification_settings ?? [];
        $secSettings = $notifiable->security_settings ?? [];

        // 1. Security Check (if applicable)
        if ($securityKey) {
            // If the specific security alert is disabled, return empty
            // We use strict comparison to false, assuming default is true if null
            if (isset($secSettings[$securityKey]) && $secSettings[$securityKey] === false) {
                return [];
            }
        }

        $selectedChannels = [];
        $preferenceContext = method_exists($this, 'notificationPreferenceContext')
            ? $this->notificationPreferenceContext()
            : null;

        // 2. Filter available channels based on global toggles stored on User
        foreach ($availableChannels as $channel) {
            switch ($channel) {
                case 'mail':
                    // Check 'email' toggle. Default to true if not set.
                    if (($notifSettings['email'] ?? true) === true) {
                        $selectedChannels[] = 'mail';
                    }
                    break;

                case 'database':
                case 'broadcast':
                    // Check 'app' toggle. Default to true if not set.
                    if (($notifSettings['app'] ?? true) === true) {
                        $selectedChannels[] = $channel;
                    }
                    break;

                case 'nexmo':
                case 'twilio':
                case 'sms':
                    // Check 'sms' toggle. Default to false if not set.
                    if (($notifSettings['sms'] ?? false) === true) {
                        $selectedChannels[] = $channel;
                    }
                    break;
                
                default:
                    // For other channels, keep them by default
                    $selectedChannels[] = $channel;
                    break;
            }
        }

        // 3. Apply NotificationSetting (per-user) preferences: quiet hours, module config, and app toggle
        try {
            $ns = NotificationSetting::where('user_id', $notifiable->id)->first();
            if ($ns) {
                if (is_array($preferenceContext) && !empty($preferenceContext['module_key']) && !empty($preferenceContext['notification_key'])) {
                    $meta = is_array($ns->meta_data ?? null) ? ($ns->meta_data ?? []) : [];
                    $modules = is_array($meta['modules'] ?? null) ? $meta['modules'] : [];
                    $moduleConfig = collect($modules)->first(fn ($module) => ($module['key'] ?? null) === $preferenceContext['module_key']);
                    $notificationConfig = collect(is_array($moduleConfig['notifications'] ?? null) ? $moduleConfig['notifications'] : [])
                        ->first(fn ($notification) => ($notification['key'] ?? null) === $preferenceContext['notification_key']);

                    if (is_array($notificationConfig)) {
                        if (($notificationConfig['enabled'] ?? true) === false) {
                            return [];
                        }

                        $channelPrefs = is_array($notificationConfig['channels'] ?? null) ? $notificationConfig['channels'] : [];
                        $selectedChannels = array_values(array_filter($selectedChannels, function ($channel) use ($channelPrefs) {
                            return match ($channel) {
                                'mail' => ($channelPrefs['email'] ?? true) === true,
                                'database', 'broadcast', WebPushChannel::class => ($channelPrefs['app'] ?? true) === true,
                                'nexmo', 'twilio', 'sms' => ($channelPrefs['sms'] ?? false) === true,
                                default => true,
                            };
                        }));
                    }
                }

                // Suppress app channels if user disabled app notifications
                if (($ns->app_notifications ?? true) === false) {
                    $selectedChannels = array_values(array_filter($selectedChannels, function ($ch) {
                        return !in_array($ch, ['database', 'broadcast', WebPushChannel::class], true);
                    }));
                }
                // Quiet hours: suppress in-app channels within time window
                if (($ns->quiet_hours_enabled ?? false) === true && $ns->quiet_hours_start && $ns->quiet_hours_end) {
                    $now = Carbon::now($notifiable->timezone ?? config('app.timezone'))->format('H:i');
                    $start = $ns->quiet_hours_start;
                    $end = $ns->quiet_hours_end;
                    $inWindow = false;
                    if ($start <= $end) {
                        // Simple range within same day
                        $inWindow = ($now >= $start && $now <= $end);
                    } else {
                        // Wrap-around (e.g., 22:00 -> 06:00)
                        $inWindow = ($now >= $start || $now <= $end);
                    }
                    if ($inWindow) {
                        $selectedChannels = array_values(array_filter($selectedChannels, function ($ch) {
                            return !in_array($ch, ['database', 'broadcast', WebPushChannel::class], true);
                        }));
                    }
                }
            }
        } catch (\Throwable $e) {
            // Fail-safe: ignore preference application errors
        }

        if ($this->webPushConfigured() && (in_array('database', $selectedChannels, true) || in_array('broadcast', $selectedChannels, true))) {
            $selectedChannels[] = WebPushChannel::class;
        }

        $selectedChannels = array_values(array_unique($selectedChannels));

        return $selectedChannels;
    }

    protected function webPushConfigured(): bool
    {
        return (bool) (
            config('webpush.vapid.subject') &&
            config('webpush.vapid.public_key') &&
            (config('webpush.vapid.private_key') || config('webpush.vapid.pem_file'))
        );
    }

    protected function withWebPushIfConfigured(array $channels): array
    {
        if ($this->webPushConfigured()) {
            $channels[] = WebPushChannel::class;
        }

        return array_values(array_unique($channels));
    }

    public function toWebPush($notifiable, $notification = null)
    {
        $payload = method_exists($this, 'toArray') ? $this->toArray($notifiable) : [];
        if (!is_array($payload)) {
            $payload = [];
        }

        $title = (string) ($payload['title'] ?? $payload['subject'] ?? 'Besouhola CRM');
        $body = (string) ($payload['message'] ?? $payload['body'] ?? 'You have a new notification.');
        $url = (string) ($payload['link'] ?? $payload['url'] ?? '/notifications');

        return (new WebPushMessage)
            ->title($title)
            ->body($body)
            ->icon('/favicon.svg')
            ->tag((string) ($payload['type'] ?? class_basename(static::class)))
            ->data(array_merge($payload, [
                'url' => $url,
                'action_url' => $url,
                'notification_id' => $notification?->id ?? null,
            ]));
    }
}
