<?php

namespace App\Data;

class AdminNotificationPayload
{
    public function __construct(
        public string $type,
        public string $title,
        public ?string $titleAr = null,
        public ?string $body = null,
        public ?string $bodyAr = null,
        public string $category = 'system',
        public string $severity = 'info',
        public string $source = 'system',
        public ?int $relatedTenantId = null,
        public array $data = [],
        public ?string $actionUrl = null,
        public array $channels = ['in_app'],
        public ?string $dedupeKey = null,
        public int $dedupeWindowMinutes = 15,
    ) {
    }
}
