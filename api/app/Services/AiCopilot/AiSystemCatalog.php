<?php

namespace App\Services\AiCopilot;

use App\Models\User;

class AiSystemCatalog
{
    public const REPORTS = [
        [
            'key' => 'leads_pipeline',
            'name' => 'Leads Pipeline',
            'permission' => 'Leads Pipeline',
            'path' => '/reports/sales/pipeline',
            'description' => 'Pipeline stages and lead distribution report.',
            'filters' => ['date_from', 'date_to', 'assigned_to', 'stage'],
        ],
        [
            'key' => 'sales_activities',
            'name' => 'Sales Activities',
            'permission' => 'Sales Activities',
            'path' => '/reports/sales/activities',
            'description' => 'Sales activity volume and outcomes.',
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'meetings',
            'name' => 'Meetings Report',
            'permission' => 'Meetings Report',
            'path' => '/reports/sales/meetings',
            'description' => 'Meetings scheduled and completed.',
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'closed_deals',
            'name' => 'Closed Deals',
            'permission' => 'Closed Deals',
            'path' => '/reports/sales/closed-deals',
            'description' => 'Closed deals and conversion outcomes.',
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'customers',
            'name' => 'Customers Report',
            'permission' => 'Customers Report',
            'path' => '/reports/sales/customers',
            'description' => 'Customer listing and status report.',
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'exports',
            'name' => 'Exports Report',
            'permission' => 'Exports Report',
            'path' => '/reports/sales/exports',
            'description' => 'History of exported files.',
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'cancellation',
            'name' => 'Cancellation Report',
            'permission' => 'Cancellation Report',
            'path' => '/reports/sales/cancellation',
            'description' => 'Cancelled deals and reasons.',
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
    ];

    public function forUser(User $user): array
    {
        $reports = [];
        foreach (self::REPORTS as $report) {
            $canShow = $this->canShowReport($user, $report['permission']);
            $canExport = $this->canExportReport($user, $report['permission']);
            if (! $canShow && ! $user->is_super_admin) {
                continue;
            }
            $reports[] = array_merge($report, [
                'can_show' => $canShow || (bool) $user->is_super_admin,
                'can_export' => $canExport || (bool) $user->is_super_admin,
            ]);
        }

        return [
            'product' => 'Besouhola Copilot',
            'capabilities' => [
                'Explain CRM modules, reports, and workflows available to the current user.',
                'Open reports with filters derived from natural language.',
                'Export or prepare download for reports the user can export.',
                'List delayed leads within the user visibility scope.',
                'Draft and confirm tasks related to delayed leads.',
            ],
            'reports' => $reports,
            'tools' => [
                'list_capabilities',
                'explain_feature',
                'navigate_report',
                'build_report_filters',
                'export_report',
                'list_delayed_leads',
                'create_task_for_lead',
            ],
        ];
    }

    public function findReport(?string $keyOrName): ?array
    {
        if (! $keyOrName) {
            return null;
        }

        $needle = strtolower(trim($keyOrName));
        foreach (self::REPORTS as $report) {
            if (
                $report['key'] === $needle
                || strtolower($report['name']) === $needle
                || str_contains(strtolower($report['name']), $needle)
                || str_contains($needle, str_replace('_', ' ', $report['key']))
            ) {
                return $report;
            }
        }

        return null;
    }

    public function canShowReport(User $user, string $reportPermissionName): bool
    {
        if ($user->is_super_admin) {
            return true;
        }

        $perms = data_get($user->meta_data, 'module_permissions.Reports', []);
        if (! is_array($perms)) {
            return false;
        }

        return in_array("{$reportPermissionName}_show", $perms, true);
    }

    public function canExportReport(User $user, string $reportPermissionName): bool
    {
        if ($user->is_super_admin) {
            return true;
        }

        $perms = data_get($user->meta_data, 'module_permissions.Reports', []);
        if (! is_array($perms)) {
            return false;
        }

        return in_array("{$reportPermissionName}_export", $perms, true);
    }
}
