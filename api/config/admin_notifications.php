<?php

return [
    'tenant_expiring_soon_days' => (int) env('ADMIN_NOTIFICATIONS_TENANT_EXPIRING_SOON_DAYS', 7),
    'storage_warning_bytes' => (int) env('ADMIN_NOTIFICATIONS_STORAGE_WARNING_BYTES', 5368709120), // 5 GB
];

