<?php

namespace App\Services\Telesales;

use App\Models\Lead;
use App\Models\User;

class TelesalesDashboardSummaryBuilder
{
    private const DISPLAY_STAGE_ORDER = [
        'fresh' => 1,
        'duplicate' => 2,
        'pending' => 3,
        'cold calls' => 4,
    ];

    public function __construct(private readonly TelesalesLeadViewService $leadViewService)
    {
    }

    public function build(iterable $leads, ?User $viewer, string $scope = 'all'): array
    {
        $byStageMap = [];
        $duplicateCount = 0;

        foreach ($leads as $lead) {
            if (!$lead instanceof Lead) {
                continue;
            }

            $displayStage = $this->leadViewService->resolveDisplayStage($lead, $viewer, $scope);
            $displayKey = $this->leadViewService->resolveDisplayStageKey($lead, $viewer, $scope);
            if ($displayKey === '') {
                continue;
            }

            if ($displayKey === 'duplicate') {
                $duplicateCount++;
                if (!$this->leadViewService->canViewDuplicateDisplayStage($viewer)) {
                    continue;
                }
            }

            if (!isset($byStageMap[$displayKey])) {
                $byStageMap[$displayKey] = [
                    'stage_key' => $displayKey,
                    'stage_name' => $displayStage,
                    'stage_type' => $this->leadViewService->normalizeValue((string) ($lead->stageRelation?->type ?? '')),
                    'count' => 0,
                ];
            }

            $byStageMap[$displayKey]['count']++;
        }

        $byStage = array_values($byStageMap);
        usort($byStage, function ($a, $b) {
            $aKey = $this->leadViewService->normalizeValue((string) ($a['stage_key'] ?? $a['stage_name'] ?? ''));
            $bKey = $this->leadViewService->normalizeValue((string) ($b['stage_key'] ?? $b['stage_name'] ?? ''));

            $aPriority = self::DISPLAY_STAGE_ORDER[$aKey] ?? PHP_INT_MAX;
            $bPriority = self::DISPLAY_STAGE_ORDER[$bKey] ?? PHP_INT_MAX;

            if ($aPriority !== $bPriority) {
                return $aPriority <=> $bPriority;
            }

            return strcmp((string) ($a['stage_name'] ?? ''), (string) ($b['stage_name'] ?? ''));
        });

        $totalLeads = 0;
        foreach ($leads as $lead) {
            if (!$lead instanceof Lead) {
                continue;
            }

            $displayKey = $this->leadViewService->resolveDisplayStageKey($lead, $viewer, $scope);
            if (!in_array($displayKey, ['convert', 'duplicate'], true)) {
                $totalLeads++;
            }
        }

        $stageCards = array_map(function (array $card) use ($byStageMap) {
            $normalizedKey = $this->leadViewService->normalizeValue(str_replace('_', ' ', (string) ($card['stage_key'] ?? '')));
            $card['count'] = (int) ($byStageMap[$normalizedKey]['count'] ?? 0);

            return $card;
        }, $this->leadViewService->buildStageCardDefinitions($viewer, $scope));

        return [
            'total_leads' => $totalLeads,
            'assigned_to_sales' => collect($leads)->whereNotNull('transferred_to_sales_at')->count(),
            'duplicate' => $this->leadViewService->canViewDuplicateDisplayStage($viewer) ? $duplicateCount : 0,
            'pending' => (int) ($byStageMap['pending']['count'] ?? 0),
            'by_stage' => $byStage,
            'stage_cards' => $stageCards,
            'visibility' => [
                'can_view_duplicate' => $this->leadViewService->canViewDuplicateDisplayStage($viewer),
                'can_view_pending' => $this->leadViewService->canViewPendingDisplayStage($viewer, $scope),
            ],
            'follow_ups_today' => 0,
            'calls_today' => 0,
        ];
    }
}
