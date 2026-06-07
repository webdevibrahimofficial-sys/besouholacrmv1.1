<?php

namespace App\Services;

use App\Models\Source;

class WebsiteSourceResolver
{
    public function getOrCreateWebsiteSourceForTenant(int $tenantId): Source
    {
        return Source::withoutGlobalScopes()->firstOrCreate(
            [
                'tenant_id' => $tenantId,
                'name' => 'Website',
            ],
            [
                'is_active' => true,
            ]
        );
    }

    public function resolveSourceNameForConnection(?int $tenantId, ?int $defaultSourceId): string
    {
        if ($tenantId && $defaultSourceId) {
            $source = Source::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->where('id', $defaultSourceId)
                ->first();

            if ($source && filled($source->name)) {
                return (string) $source->name;
            }
        }

        return 'Website';
    }
}
