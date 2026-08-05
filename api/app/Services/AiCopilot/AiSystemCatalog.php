<?php

namespace App\Services\AiCopilot;

use App\Models\User;

class AiSystemCatalog
{
    /**
     * Full CRM reports catalog. `permission` must match the Reports matrix labels.
     */
    public const REPORTS = [
        [
            'key' => 'leads_pipeline',
            'name' => 'Leads Pipeline',
            'permission' => 'Leads Pipeline',
            'path' => '/reports/sales/pipeline',
            'description' => 'Pipeline stages and lead distribution report.',
            'aliases' => ['pipeline', 'Ø¨Ø§ÙŠØ¨Ù„Ø§ÙŠÙ†', 'leads pipeline', 'Ø®Ø· Ø³ÙŠØ±', 'Ø¨Ø§ÙŠØ¨ Ù„Ø§ÙŠÙ†'],
            'filters' => ['date_from', 'date_to', 'assigned_to', 'stage'],
        ],
        [
            'key' => 'sales_activities',
            'name' => 'Sales Activities',
            'permission' => 'Sales Activities',
            'path' => '/reports/sales/activities',
            'description' => 'Sales activity volume and outcomes.',
            'aliases' => ['activities', 'activity', 'Ø§Ù†Ø´Ø·Ø©', 'Ø£Ù†Ø´Ø·Ø©', 'sales activities', 'Ø§ÙƒØªÙŠÙØªÙŠ'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'sales_to_telesales',
            'name' => 'Leads To Telesales',
            'permission' => 'Leads Pipeline',
            'path' => '/reports/sales/to-telesales',
            'description' => 'Leads transferred from sales to telesales.',
            'aliases' => ['telesales', 'ØªÙŠÙ„ÙŠ', 'ØªÙŠÙ„ÙŠØ³ÙŠÙ„Ø²', 'to telesales', 'Ù…Ø­ÙˆÙ„Ø©', 'ØªÙ„ÙŠ Ø³ÙŠÙ„Ø²'],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'meetings',
            'name' => 'Meetings Report',
            'permission' => 'Meetings Report',
            'path' => '/reports/sales/meetings',
            'description' => 'Meetings scheduled and completed.',
            'aliases' => ['meeting', 'meetings', 'Ù…ÙŠØªÙ†Ø¬', 'Ù…ÙŠØªÙŠÙ†Ø¬', 'Ù…ÙŠØªÙ†Ø¬', 'Ø§Ø¬ØªÙ…Ø§Ø¹', 'Ø§Ø¬ØªÙ…Ø§Ø¹Ø§Øª', 'Ø§Ù„Ù…ÙŠØªÙ†Ø¬'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'reservations',
            'name' => 'Reservations Report',
            'permission' => 'Reservations Report',
            'path' => '/reports/sales/reservations',
            'description' => 'Reservations listing and status report.',
            'aliases' => ['reservation', 'reservations', 'Ø±ÙŠØ²ÙŠØ±ÙÙŠØ´Ù†', 'Ø±ÙŠØ²Ø±ÙÙŠØ´Ù†', 'Ø±ÙŠØ²ÙŠØ±ÙÙŠØ´Ù†Ø²', 'Ø­Ø¬Ø²', 'Ø­Ø¬ÙˆØ²Ø§Øª', 'Ø§Ù„Ø±ÙŠØ²ÙŠØ±ÙÙŠØ´Ù†'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'closed_deals',
            'name' => 'Closed Deals',
            'permission' => 'Closed Deals',
            'path' => '/reports/sales/closed-deals',
            'description' => 'Closed deals and conversion outcomes.',
            'aliases' => ['closed', 'deals', 'ØµÙÙ‚Ø§Øª', 'closed deals', 'Ù…ØºÙ„Ù‚Ø©', 'ÙƒÙ„ÙˆØ²Ø¯'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'cancellation',
            'name' => 'Cancellation Report',
            'permission' => 'Cancellation Report',
            'path' => '/reports/sales/cancellation',
            'description' => 'Cancelled deals and reasons.',
            'aliases' => ['cancel', 'cancellation', 'Ø§Ù„ØºØ§Ø¡', 'Ø¥Ù„ØºØ§Ø¡', 'Ø§Ù„ØºØ§Ø¡Ø§Øª', 'Ø¥Ù„ØºØ§Ø¡Ø§Øª', 'ÙƒØ§Ù†Ø³ÙŠÙ„'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'rent',
            'name' => 'Rent Report',
            'permission' => 'Rent Report',
            'path' => '/reports/sales/rent',
            'description' => 'Active rent and rental performance.',
            'aliases' => ['rent', 'rental', 'Ø§ÙŠØ¬Ø§Ø±', 'Ø¥ÙŠØ¬Ø§Ø±', 'Ø§ÙŠØ¬Ø§Ø±Ø§Øª', 'Ø§Ù„Ø¥ÙŠØ¬Ø§Ø±'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'proposals',
            'name' => 'Proposals Report',
            'permission' => 'Proposals Report',
            'path' => '/reports/sales/proposals',
            'description' => 'Proposals sent and follow-up status.',
            'aliases' => ['proposal', 'proposals', 'Ø¹Ø±Ø¶', 'Ø¹Ø±ÙˆØ¶', 'Ø¨Ø±ÙˆØ¨ÙˆØ²Ø§Ù„', 'Ø§Ù„Ø¨Ø±ÙˆØ¨ÙˆØ²Ø§Ù„'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'check_in',
            'name' => 'Check In Report',
            'permission' => 'Check In Report',
            'path' => '/reports/sales/check-in',
            'description' => 'Check-ins and visit tracking.',
            'aliases' => ['check in', 'check-in', 'checkin', 'visit', 'Ø²ÙŠØ§Ø±Ø§Øª', 'ØªØ´ÙŠÙƒ Ø§Ù†', 'ØªØ´ÙŠÙƒ-Ø§Ù†'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'customers',
            'name' => 'Customers Report',
            'permission' => 'Customers Report',
            'path' => '/reports/sales/customers',
            'description' => 'Customer listing and status report.',
            'aliases' => ['customer', 'customers', 'Ø¹Ù…ÙŠÙ„', 'Ø¹Ù…Ù„Ø§Ø¡', 'ÙƒØ³ØªÙ…Ø±'],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'targets_revenue',
            'name' => 'Targets & Revenue',
            'permission' => 'Targets & Revenue',
            'path' => '/reports/sales/revenue',
            'description' => 'Targets and revenue performance.',
            'aliases' => ['revenue', 'target', 'targets', 'Ø§ÙŠØ±Ø§Ø¯', 'Ø¥ÙŠØ±Ø§Ø¯', 'Ø§Ù‡Ø¯Ø§Ù', 'Ø£Ù‡Ø¯Ø§Ù', 'Ø±ÙŠÙÙŠÙ†ÙŠÙˆ'],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'imports',
            'name' => 'Imports Report',
            'permission' => 'Imports Report',
            'path' => '/reports/sales/imports',
            'description' => 'Imported records history.',
            'aliases' => [
                'import', 'imports', 'Ø§Ø³ØªÙŠØ±Ø§Ø¯', 'Ø§Ù„Ø§Ø³ØªÙŠØ±Ø§Ø¯',
                'Ø§Ù…Ø¨ÙˆØ±Øª', 'Ø§Ù…Ø¨ÙˆØ±ØªØ³', 'Ø§Ù„Ø§Ù…Ø¨ÙˆØ±Øª', 'Ø§Ù„Ø§Ù…Ø¨ÙˆØ±ØªØ³',
                'Ø¥Ù…Ø¨ÙˆØ±Øª', 'Ø¥Ù…Ø¨ÙˆØ±ØªØ³', 'Ø§Ù„Ø¥Ù…Ø¨ÙˆØ±Øª', 'Ø§Ù„Ø¥Ù…Ø¨ÙˆØ±ØªØ³',
            ],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'exports',
            'name' => 'Exports Report',
            'permission' => 'Exports Report',
            'path' => '/reports/sales/exports',
            'description' => 'History of exported files.',
            'aliases' => [
                'export report', 'exports report', 'ØªØµØ¯ÙŠØ±', 'ØªÙ‚Ø±ÙŠØ± Ø§Ù„ØªØµØ¯ÙŠØ±', 'Ø§Ù„ØªØµØ¯ÙŠØ±',
                'Ø§ÙƒØ³Ø¨ÙˆØ±Øª', 'Ø§ÙƒØ³Ø¨ÙˆØ±ØªØ³', 'Ø§Ù„Ø§ÙƒØ³Ø¨ÙˆØ±Øª', 'Ø§Ù„Ø§ÙƒØ³Ø¨ÙˆØ±ØªØ³',
                'Ø¥ÙƒØ³Ø¨ÙˆØ±Øª', 'Ø¥ÙƒØ³Ø¨ÙˆØ±ØªØ³',
            ],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'sales_overview',
            'name' => 'Sales Report',
            'permission' => 'Sales Activities',
            'path' => '/reports/sales',
            'description' => 'Sales overview report.',
            'aliases' => ['sales report', 'ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù…Ø¨ÙŠØ¹Ø§Øª', 'sales overview'],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'leads_report',
            'name' => 'Leads Report',
            'permission' => 'Leads Pipeline',
            'path' => '/reports/leads',
            'description' => 'Leads summary report.',
            'aliases' => ['leads report', 'ØªÙ‚Ø±ÙŠØ± Ø§Ù„Ù„ÙŠØ¯Ø²'],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'team_performance',
            'name' => 'Team Performance',
            'permission' => 'Sales Activities',
            'path' => '/reports/team',
            'description' => 'Team performance report.',
            'aliases' => ['team performance', 'Ø§Ø¯Ø§Ø¡ Ø§Ù„ÙØ±ÙŠÙ‚', 'Ø£Ø¯Ø§Ø¡ Ø§Ù„ÙØ±ÙŠÙ‚', 'ØªÙŠÙ…'],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'campaign_duration',
            'name' => 'Campaign Duration',
            'permission' => 'Sales Activities',
            'path' => '/reports/marketing/analysis/duration',
            'description' => 'Marketing campaign duration analysis.',
            'aliases' => ['campaign duration', 'Ù…Ø¯Ø© Ø§Ù„Ø­Ù…Ù„Ø©', 'ÙƒØ§Ù…Ø¨ÙŠÙ†'],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'campaign_ab',
            'name' => 'AB Campaign Comparison',
            'permission' => 'Sales Activities',
            'path' => '/reports/marketing/analysis/ab',
            'description' => 'A/B campaign comparison.',
            'aliases' => ['ab campaign', 'a/b', 'Ù…Ù‚Ø§Ø±Ù†Ø© Ø§Ù„Ø­Ù…Ù„Ø§Øª'],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'response_time',
            'name' => 'Response Time',
            'permission' => 'Sales Activities',
            'path' => '/reports/marketing/operational/response-time',
            'description' => 'Marketing response time report.',
            'aliases' => ['response time', 'ÙˆÙ‚Øª Ø§Ù„Ø§Ø³ØªØ¬Ø§Ø¨Ø©', 'Ø³Ø±Ø¹Ø© Ø§Ù„Ø±Ø¯'],
            'filters' => ['date_from', 'date_to'],
        ],
    ];

    public function forUser(User $user): array
    {
        $reports = [];
        foreach (self::REPORTS as $report) {
            $canShow = $this->canShowReport($user, $report['permission']);
            $canExport = $this->canExportReport($user, $report['permission']);
            if (! $canShow) {
                continue;
            }
            $reports[] = array_merge($report, [
                'can_show' => true,
                'can_export' => $canExport,
            ]);
        }

        return [
            'product' => 'Besouhola Copilot',
            'capabilities' => [
                'Explain CRM modules, reports, and workflows available to the current user.',
                'Open any permitted report with filters derived from natural language.',
                'Export or prepare download for reports the user can export.',
                'List delayed leads within the user visibility scope.',
                'Draft and confirm tasks related to delayed leads.',
                'Draft and confirm lead creation using the existing backend lead flow.',
                'Draft and confirm lead actions using the existing backend lead action flow.',
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

        $needle = $this->normalizeMatchText($keyOrName);

        foreach (self::REPORTS as $report) {
            $candidates = array_merge(
                [$report['key'], $report['name']],
                $report['aliases'] ?? []
            );

            foreach ($candidates as $candidate) {
                $candidate = $this->normalizeMatchText((string) $candidate);
                if ($candidate === '') {
                    continue;
                }
                if (
                    $needle === $candidate
                    || str_contains($needle, $candidate)
                    || str_contains($candidate, $needle)
                ) {
                    return $report;
                }
            }
        }

        return null;
    }

    public function guessReportKey(string $text): ?string
    {
        $normalizedText = $this->normalizeMatchText($text);
        $bestKey = null;
        $bestLen = 0;

        foreach (self::REPORTS as $report) {
            $candidates = array_merge(
                [$report['key'], $report['name']],
                $report['aliases'] ?? []
            );

            foreach ($candidates as $candidate) {
                $candidate = $this->normalizeMatchText((string) $candidate);
                if ($candidate === '') {
                    continue;
                }

                // Prefer specific phrases; allow short Arabic tokens (2+).
                $minLen = preg_match('/\p{Arabic}/u', $candidate) ? 2 : 4;
                if (mb_strlen($candidate) < $minLen) {
                    continue;
                }

                if (str_contains($normalizedText, $candidate) && mb_strlen($candidate) >= $bestLen) {
                    $bestKey = $report['key'];
                    $bestLen = mb_strlen($candidate);
                }
            }
        }

        return $bestKey;
    }

    protected function normalizeMatchText(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = str_replace(['Ø¥', 'Ø£', 'Ø¢', 'Ù‰', 'Ø©'], ['Ø§', 'Ø§', 'Ø§', 'ÙŠ', 'Ù‡'], $value);
        // Drop Arabic definite article so "Ø§Ù„Ø§Ù…Ø¨ÙˆØ±ØªØ³" matches "Ø§Ù…Ø¨ÙˆØ±ØªØ³".
        $value = preg_replace('/(^|\s)Ø§Ù„(?=\p{Arabic})/u', '$1', $value) ?? $value;
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }

    public function canShowReport(User $user, string $reportPermissionName): bool
    {
        if ($this->isAdminRole($user)) {
            return true;
        }

        $modulePermissions = data_get($user->meta_data, 'module_permissions', []);
        if (! is_array($modulePermissions)) {
            return false;
        }

        $controlPerms = $modulePermissions['Control'] ?? [];
        $hasReportsAccess = is_array($controlPerms) && in_array('showReports', $controlPerms, true);
        if (! $hasReportsAccess) {
            return false;
        }

        // Legacy users without an explicit Reports matrix keep full show access.
        if (! array_key_exists('Reports', $modulePermissions)) {
            return true;
        }

        $perms = $modulePermissions['Reports'] ?? [];
        if (! is_array($perms)) {
            return false;
        }

        return in_array("{$reportPermissionName}_show", $perms, true);
    }

    public function canExportReport(User $user, string $reportPermissionName): bool
    {
        if ($this->isAdminRole($user)) {
            return true;
        }

        $modulePermissions = data_get($user->meta_data, 'module_permissions', []);
        if (! is_array($modulePermissions)) {
            return false;
        }

        $controlPerms = $modulePermissions['Control'] ?? [];
        $hasReportsAccess = is_array($controlPerms) && in_array('showReports', $controlPerms, true);
        if (! $hasReportsAccess) {
            return false;
        }

        if (! array_key_exists('Reports', $modulePermissions)) {
            return true;
        }

        $perms = $modulePermissions['Reports'] ?? [];
        if (! is_array($perms)) {
            return false;
        }

        return in_array("{$reportPermissionName}_export", $perms, true);
    }

    protected function isAdminRole(User $user): bool
    {
        if ($user->is_super_admin) {
            return true;
        }

        $role = strtolower(trim((string) ($user->role ?? '')));

        return in_array($role, ['admin', 'tenant admin', 'tenant-admin'], true);
    }
}


