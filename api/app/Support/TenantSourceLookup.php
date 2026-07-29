<?php

namespace App\Support;

use App\Models\Source;

class TenantSourceLookup
{
    public static function resolveName(?int $tenantId, $sourceName): ?string
    {
        $sourceName = trim((string) $sourceName);

        if (!$tenantId || $sourceName === '') {
            return null;
        }

        $normalized = mb_strtolower($sourceName, 'UTF-8');

        $source = Source::withoutGlobalScopes()
            ->where('tenant_id', $tenantId)
            ->whereRaw('LOWER(name) = ?', [$normalized])
            ->first();

        return $source && filled($source->name)
            ? (string) $source->name
            : null;
    }
}
