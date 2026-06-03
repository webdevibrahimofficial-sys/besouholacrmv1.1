<?php

namespace App\Listeners;

use App\Jobs\SendFcmNotificationJob;
use App\Models\User;
use Illuminate\Notifications\Events\NotificationSent;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class SendFcmNotificationForDatabaseChannel
{
    public function handle(NotificationSent $event): void
    {
        if ($event->channel !== 'database') {
            return;
        }

        if (!$event->notifiable instanceof User) {
            return;
        }

        if (!method_exists($event->notification, 'toArray')) {
            return;
        }

        $payload = $event->notification->toArray($event->notifiable);
        if (!is_array($payload)) {
            return;
        }

        [$title, $body, $data] = $this->buildFcmPayload($event->notification, $payload);

        try {
            dispatch((new SendFcmNotificationJob(
                userId: $event->notifiable->id,
                tenantId: $event->notifiable->tenant_id,
                title: $title,
                body: $body,
                data: $data,
            ))->onQueue('fcm'));
        } catch (\Throwable $e) {
            Log::error('Failed to dispatch FCM notification job', [
                'notification' => get_class($event->notification),
                'user_id' => $event->notifiable->id,
                'message' => $e->getMessage(),
            ]);
        }
    }

    protected function buildFcmPayload(object $notification, array $payload): array
    {
        $title = (string) ($payload['title'] ?? 'New Notification');
        $body = (string) ($payload['body'] ?? $payload['message'] ?? 'You have a new notification');
        $data = $this->normalizeData($notification, $payload);

        return [$title, $body, $data];
    }

    protected function normalizeData(object $notification, array $payload): array
    {
        $data = $payload;
        $data['type'] = (string) ($payload['type'] ?? Str::snake(class_basename($notification)));

        if (isset($payload['lead_id'])) {
            $data['screen'] = (string) ($payload['screen'] ?? 'lead_details');
            $data['entity_id'] = (string) ($payload['entity_id'] ?? $payload['lead_id']);
        } elseif (isset($payload['task_id'])) {
            $data['screen'] = (string) ($payload['screen'] ?? 'task_details');
            $data['entity_id'] = (string) ($payload['entity_id'] ?? $payload['task_id']);
        } elseif (isset($payload['ticket_id'])) {
            $data['screen'] = (string) ($payload['screen'] ?? 'ticket_details');
            $data['entity_id'] = (string) ($payload['entity_id'] ?? $payload['ticket_id']);
        } elseif (isset($payload['customer_id'])) {
            $data['screen'] = (string) ($payload['screen'] ?? 'customer_details');
            $data['entity_id'] = (string) ($payload['entity_id'] ?? $payload['customer_id']);
        } elseif (isset($payload['request_id'])) {
            $data['screen'] = (string) ($payload['screen'] ?? 'request_details');
            $data['entity_id'] = (string) ($payload['entity_id'] ?? $payload['request_id']);
        }

        return $this->stringifyData($data);
    }

    protected function stringifyData(array $data): array
    {
        $normalized = [];

        foreach ($data as $key => $value) {
            if (!is_string($key) || $key === '' || in_array($key, ['title', 'message', 'body'], true)) {
                continue;
            }

            if (is_bool($value)) {
                $normalized[$key] = $value ? 'true' : 'false';
                continue;
            }

            if (is_scalar($value) || $value === null) {
                $normalized[$key] = (string) ($value ?? '');
                continue;
            }

            $normalized[$key] = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '';
        }

        return $normalized;
    }
}
