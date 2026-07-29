<?php

namespace App\Notifications\Concerns;

use App\Models\Lead;
use App\Services\TelesalesService;

trait ResolvesLeadNotificationContext
{
    protected function resolveLeadNotificationContext(?Lead $lead, ?int $actionId = null): array
    {
        $workflowKey = strtolower(trim((string) ($lead?->workflow_key ?? TelesalesService::WORKFLOW_SALES)));
        $isTelesales = $workflowKey === TelesalesService::WORKFLOW_TELESALES;
        $basePath = $isTelesales ? '/telesales' : '/leads';
        $link = $lead?->id ? "{$basePath}?lead_id={$lead->id}" : $basePath;

        if ($actionId) {
            $link .= ($lead?->id ? '&' : '?') . "action_id={$actionId}";
        }

        return [
            'is_telesales' => $isTelesales,
            'workflow_key' => $isTelesales ? TelesalesService::WORKFLOW_TELESALES : TelesalesService::WORKFLOW_SALES,
            'module_key' => $isTelesales ? TelesalesService::MODULE_SLUG : 'leads',
            'screen' => 'lead_details',
            'link' => $link,
        ];
    }
}
