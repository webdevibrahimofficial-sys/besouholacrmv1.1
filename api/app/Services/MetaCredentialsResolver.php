<?php

namespace App\Services;

use RuntimeException;

class MetaCredentialsResolver
{
    public function __construct(protected MetaSystemSettingsService $metaSystemSettings)
    {
    }

    public function resolveForTenant($tenantId = null): array
    {
        if (!config('services.meta.mock_mode') && !$this->metaSystemSettings->isConfigured()) {
            throw new RuntimeException('Shared Meta App is not configured. Please configure it in System Admin settings.');
        }

        $credentials = $this->metaSystemSettings->resolveSharedCredentials(!config('services.meta.mock_mode'));

        return array_merge($credentials, [
            'tenant_id' => $tenantId,
        ]);
    }

    public function resolveShared(): array
    {
        return $this->metaSystemSettings->resolveSharedCredentials(!config('services.meta.mock_mode'));
    }
}
