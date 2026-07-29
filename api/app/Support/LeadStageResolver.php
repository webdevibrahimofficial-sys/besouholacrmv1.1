<?php

namespace App\Support;

use App\Models\Stage;

class LeadStageResolver
{
    /**
     * @return array<string, string>
     */
    public static function allowedStageMap(?int $tenantId): array
    {
        $allowed = [];

        foreach (self::defaultStageAliases() as $alias => $canonical) {
            $allowed[$alias] = $canonical;
        }

        if (!$tenantId) {
            return $allowed;
        }

        $stageRows = Stage::query()
            ->where('tenant_id', $tenantId)
            ->get(['name', 'name_ar']);

        foreach ($stageRows as $stageRow) {
            $canonicalStage = trim((string) ($stageRow->name ?? $stageRow->name_ar ?? ''));
            if ($canonicalStage === '') {
                continue;
            }

            foreach ([(string) ($stageRow->name ?? ''), (string) ($stageRow->name_ar ?? '')] as $stageAlias) {
                $stageAlias = trim($stageAlias);
                if ($stageAlias === '') {
                    continue;
                }

                $allowed[self::normalizeKey($stageAlias)] = $canonicalStage;
            }
        }

        return $allowed;
    }

    public static function resolve(?int $tenantId, ?string $stage, bool $defaultToNewLead = true): ?string
    {
        $rawStage = trim((string) $stage);
        if ($rawStage === '') {
            return $defaultToNewLead ? 'New Lead' : null;
        }

        $stageKey = self::normalizeKey($rawStage);
        $allowed = self::allowedStageMap($tenantId);

        return $allowed[$stageKey] ?? null;
    }

    public static function normalizeKey(?string $stage): string
    {
        return strtolower(str_replace([' ', '-'], '', trim((string) $stage)));
    }

    /**
     * @return array<string, string>
     */
    private static function defaultStageAliases(): array
    {
        return [
            'new' => 'New Lead',
            'newlead' => 'New Lead',
            'fresh' => 'New Lead',
            self::normalizeKey('New Lead') => 'New Lead',
            'coldcall' => 'Cold Calls',
            'coldcalls' => 'Cold Calls',
            self::normalizeKey('Cold Calls') => 'Cold Calls',
        ];
    }
}
