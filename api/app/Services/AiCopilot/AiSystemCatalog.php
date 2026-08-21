<?php

namespace App\Services\AiCopilot;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

class AiSystemCatalog
{
    /**
     * High-level CRM modules for permission-aware system explanations.
     * Keep paths aligned with the main app sidebar routes.
     */
    public const MODULES = [
        [
            'key' => 'leads',
            'name' => 'Leads',
            'name_ar' => 'الليدز',
            'path' => '/leads',
            'description' => 'Manage sales leads, assignments, pipeline stages, and follow-ups.',
            'description_ar' => 'إدارة الليدز، التعيين، مراحل البايبلاين، والمتابعات.',
            'aliases' => [
                'leads', 'lead', 'lead management',
                'ليدز', 'الليدز', 'عميل محتمل', 'عملاء محتملين', 'ادارة الليدز',
            ],
            'copilot' => [
                'List delayed leads in your visibility scope',
                'Draft and confirm a new lead',
                'Draft and confirm a lead action',
                'Draft a follow-up task for a lead',
            ],
            'copilot_ar' => [
                'عرض الليدز المتأخرة حسب صلاحياتك',
                'إنشاء ليد جديد بعد التأكيد',
                'إنشاء أكشن على ليد بعد التأكيد',
                'إنشاء تاسك متابعة لليد',
            ],
            'gate' => 'leads',
        ],
        [
            'key' => 'reports',
            'name' => 'Reports',
            'name_ar' => 'التقارير',
            'path' => '/reports',
            'description' => 'Sales and performance reports with filters and export.',
            'description_ar' => 'تقارير المبيعات والأداء مع الفلاتر والتصدير.',
            'aliases' => [
                'reports', 'report', 'reporting',
                'تقارير', 'التقارير', 'تقرير',
            ],
            'copilot' => [
                'List reports you can open',
                'Open a report with natural-language filters',
                'Export or download a report you are allowed to export',
            ],
            'copilot_ar' => [
                'عرض التقارير المتاحة لك',
                'فتح تقرير بفلاتر من كلامك',
                'تصدير أو تحميل تقرير حسب صلاحية التصدير',
            ],
            'gate' => 'reports',
        ],
        [
            'key' => 'tasks',
            'name' => 'Tasks',
            'name_ar' => 'المهام',
            'path' => '/tasks',
            'description' => 'Personal and team tasks for follow-ups and work tracking.',
            'description_ar' => 'مهام شخصية وللفريق للمتابعة وتتبع الشغل.',
            'aliases' => [
                'tasks', 'task',
                'مهام', 'المهام', 'مهمة', 'تاسك', 'التاسكات',
            ],
            'copilot' => [
                'Draft a task linked to a delayed lead (with confirmation)',
            ],
            'copilot_ar' => [
                'إنشاء تاسك مرتبط بليد متأخر (بعد التأكيد)',
            ],
            'gate' => 'tasks',
        ],
        [
            'key' => 'telesales',
            'name' => 'Telesales',
            'name_ar' => 'التيليسيلز',
            'path' => '/telesales/dashboard',
            'description' => 'Telesales pipeline, transfers from sales, and telesales follow-ups.',
            'description_ar' => 'بايبلاين التيليسيلز، التحويل من المبيعات، ومتابعات التيلي.',
            'aliases' => [
                'telesales', 'tele sales',
                'تيليسيلز', 'تيلي سيلز', 'التيلس', 'قسم التيلي',
            ],
            'copilot' => [
                'List delayed telesales leads',
                'Open Leads To Telesales report when permitted',
            ],
            'copilot_ar' => [
                'عرض ليدز التيليسيلز المتأخرة',
                'فتح تقرير التحويل للتيليسيلز عند توفر الصلاحية',
            ],
            'gate' => 'telesales',
        ],
        [
            'key' => 'marketing_meta',
            'name' => 'Marketing / Meta',
            'name_ar' => 'التسويق / ميتا',
            'path' => '/marketing/meta-integration',
            'description' => 'Marketing campaigns and Meta (Facebook) lead ads integration.',
            'description_ar' => 'حملات التسويق وربط Meta (فيسبوك) لليد أدز.',
            'aliases' => [
                'marketing', 'meta', 'facebook', 'lead ads', 'meta integration',
                'ماركتنج', 'التسويق', 'ميتا', 'فيسبوك', 'ليد ادز',
            ],
            'copilot' => [
                'Explain Marketing / Meta at a high level',
                'Open Meta Integration when you have access',
            ],
            'copilot_ar' => [
                'شرح التسويق / ميتا بشكل مبسّط',
                'فتح إعدادات Meta Integration عند توفر الصلاحية',
            ],
            'gate' => 'marketing',
        ],
        [
            'key' => 'settings',
            'name' => 'Settings',
            'name_ar' => 'الإعدادات',
            'path' => '/settings',
            'description' => 'Company, CRM, integrations, rotation, and configuration settings.',
            'description_ar' => 'إعدادات الشركة، الـ CRM، التكاملات، الروتيشن، والضبط العام.',
            'aliases' => [
                'settings', 'setting', 'configuration',
                'اعدادات', 'الإعدادات', 'اعدادات السيستم', 'الكونفجريشن',
            ],
            'copilot' => [
                'Explain settings areas at a high level',
                'Open Settings when you have access',
            ],
            'copilot_ar' => [
                'شرح أقسام الإعدادات بشكل مبسّط',
                'فتح الإعدادات عند توفر الصلاحية',
            ],
            'gate' => 'settings',
        ],
    ];

    /**
     * Full CRM reports catalog. `permission` must match the Reports matrix labels.
     * Keep keys/paths in sync with frontend/src/features/ai-copilot/utils/reportCatalog.js
     */
    public const REPORTS = [
        [
            'key' => 'leads_pipeline',
            'name' => 'Leads Pipeline',
            'permission' => 'Leads Pipeline',
            'path' => '/reports/sales/pipeline',
            'description' => 'Pipeline stages and lead distribution report.',
            'aliases' => ['pipeline', 'بايبلاين', 'leads pipeline', 'خط سير', 'بايب لاين', 'الليدز', 'ليدز'],
            'filters' => ['date_from', 'date_to', 'assigned_to', 'stage'],
        ],
        [
            'key' => 'sales_activities',
            'name' => 'Sales Activities',
            'permission' => 'Sales Activities',
            'path' => '/reports/sales/activities',
            'description' => 'Sales activity volume and outcomes.',
            'aliases' => ['activities', 'activity', 'انشطة', 'أنشطة', 'sales activities', 'اكتيفتي', 'نشاط'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'sales_to_telesales',
            'name' => 'Leads To Telesales',
            'permission' => 'Leads Pipeline',
            'path' => '/reports/sales/to-telesales',
            'description' => 'Leads transferred from sales to telesales.',
            'aliases' => [
                'telesales', 'تيلي', 'تيليسيلز', 'to telesales', 'محولة', 'تلي سيلز',
                'sales_to_telesales_transfers',
            ],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'meetings',
            'name' => 'Meetings Report',
            'permission' => 'Meetings Report',
            'path' => '/reports/sales/meetings',
            'description' => 'Meetings scheduled and completed.',
            'aliases' => ['meeting', 'meetings', 'ميتنج', 'ميتينج', 'اجتماع', 'اجتماعات', 'الميتنج'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'reservations',
            'name' => 'Reservations Report',
            'permission' => 'Reservations Report',
            'path' => '/reports/sales/reservations',
            'description' => 'Reservations listing and status report.',
            'aliases' => ['reservation', 'reservations', 'ريزيرفيشن', 'ريزرفيشن', 'حجز', 'حجوزات', 'الريزيرفيشن'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'closed_deals',
            'name' => 'Closed Deals',
            'permission' => 'Closed Deals',
            'path' => '/reports/sales/closed-deals',
            'description' => 'Closed deals and conversion outcomes.',
            'aliases' => ['closed', 'deals', 'صفقات', 'closed deals', 'مغلقة', 'كلوزد', 'صفقات مغلقة'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'cancellation',
            'name' => 'Cancellation Report',
            'permission' => 'Cancellation Report',
            'path' => '/reports/sales/cancellation',
            'description' => 'Cancelled deals and reasons.',
            'aliases' => ['cancel', 'cancellation', 'الغاء', 'إلغاء', 'الغاءات', 'إلغاءات', 'كانسيل'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'rent',
            'name' => 'Rent Report',
            'permission' => 'Rent Report',
            'path' => '/reports/sales/rent',
            'description' => 'Active rent and rental performance.',
            'aliases' => ['rent', 'rental', 'ايجار', 'إيجار', 'ايجارات', 'الإيجار'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'proposals',
            'name' => 'Proposals Report',
            'permission' => 'Proposals Report',
            'path' => '/reports/sales/proposals',
            'description' => 'Proposals sent and follow-up status.',
            'aliases' => ['proposal', 'proposals', 'عرض', 'عروض', 'بروبوزال', 'البروبوزال'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'check_in',
            'name' => 'Check In Report',
            'permission' => 'Check In Report',
            'path' => '/reports/sales/check-in',
            'description' => 'Check-ins and visit tracking.',
            'aliases' => ['check in', 'check-in', 'checkin', 'visit', 'زيارات', 'تشيك ان', 'تشيك-ان'],
            'filters' => ['date_from', 'date_to', 'assigned_to'],
        ],
        [
            'key' => 'customers',
            'name' => 'Customers Report',
            'permission' => 'Customers Report',
            'path' => '/reports/sales/customers',
            'description' => 'Customer listing and status report.',
            'aliases' => ['customer', 'customers', 'عميل', 'عملاء', 'كستمر'],
            'filters' => ['date_from', 'date_to'],
            'requires_company_type' => 'general',
        ],
        [
            'key' => 'targets_revenue',
            'name' => 'Targets & Revenue',
            'permission' => 'Targets & Revenue',
            'path' => '/reports/sales/revenue',
            'description' => 'Targets and revenue performance.',
            'aliases' => ['revenue', 'target', 'targets', 'ايراد', 'إيراد', 'اهداف', 'أهداف', 'ريفينيو'],
            'filters' => ['date_from', 'date_to'],
        ],
        [
            'key' => 'imports',
            'name' => 'Imports Report',
            'permission' => 'Imports Report',
            'path' => '/reports/sales/imports',
            'description' => 'Imported records history.',
            'aliases' => [
                'import', 'imports', 'استيراد', 'الاستيراد',
                'امبورت', 'امبورتس', 'الامبورت', 'الامبورتس',
                'إمبورت', 'إمبورتس', 'الإمبورت', 'الإمبورتس',
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
                'export report', 'exports report', 'تصدير', 'تقرير التصدير', 'التصدير',
                'اكسبورت', 'اكسبورتس', 'الاكسبورت', 'الاكسبورتس',
                'إكسبورت', 'إكسبورتس',
            ],
            'filters' => ['date_from', 'date_to'],
        ],
    ];

    public function forUser(User $user): array
    {
        $tenant = app()->bound('tenant') ? app('tenant') : null;
        if (! $tenant && $user->tenant_id) {
            $tenant = Tenant::query()->find($user->tenant_id);
        }
        $companyType = strtolower(trim((string) ($tenant?->company_type ?? '')));
        $isRealEstate = $companyType !== '' && str_contains($companyType, 'real');

        $reports = [];
        foreach (self::REPORTS as $report) {
            if (($report['requires_company_type'] ?? null) === 'general' && $isRealEstate) {
                continue;
            }
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

        $modules = [];
        foreach (self::MODULES as $module) {
            if (! $this->canShowModule($user, $module)) {
                continue;
            }
            $modules[] = array_merge($module, [
                'can_show' => true,
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
            'modules' => $modules,
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

    public function isSystemOverviewTopic(?string $topic): bool
    {
        $needle = $this->normalizeMatchText((string) $topic);
        if ($needle === '') {
            return false;
        }

        foreach (['system', 'crm', 'overview', 'سيستم', 'النظام', 'السيستم', 'المنظومه', 'المنظومة'] as $token) {
            $token = $this->normalizeMatchText($token);
            if ($needle === $token || str_contains($needle, $token)) {
                return true;
            }
        }

        return false;
    }

    public function findModule(?string $keyOrName): ?array
    {
        if (! $keyOrName) {
            return null;
        }

        $needle = $this->normalizeMatchText($keyOrName);

        foreach (self::MODULES as $module) {
            $candidates = array_merge(
                [$module['key'], $module['name']],
                $module['aliases'] ?? []
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
                    return $module;
                }
            }
        }

        return null;
    }

    public function guessModuleKey(string $text): ?string
    {
        $normalizedText = $this->normalizeMatchText($text);
        $bestKey = null;
        $bestLen = 0;

        foreach (self::MODULES as $module) {
            $candidates = array_merge(
                [$module['key'], $module['name']],
                $module['aliases'] ?? []
            );

            foreach ($candidates as $candidate) {
                $candidate = $this->normalizeMatchText((string) $candidate);
                if ($candidate === '') {
                    continue;
                }

                // Avoid ultra-short English tokens like "meta" colliding too aggressively;
                // Arabic 2+ chars is fine for CRM slang.
                $minLen = preg_match('/\p{Arabic}/u', $candidate) ? 2 : 4;
                if (mb_strlen($candidate) < $minLen) {
                    continue;
                }

                if (str_contains($normalizedText, $candidate) && mb_strlen($candidate) >= $bestLen) {
                    $bestKey = $module['key'];
                    $bestLen = mb_strlen($candidate);
                }
            }
        }

        return $bestKey;
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

    public function canShowModule(User $user, array $module): bool
    {
        $gate = (string) ($module['gate'] ?? '');

        if ($gate === 'telesales' && ! $this->tenantHasTelesalesModule($user)) {
            return false;
        }

        if ($this->isAdminRole($user)) {
            return true;
        }

        return match ($gate) {
            'leads' => $this->canAccessLeadsModule($user),
            'reports' => $this->canAccessReportsModule($user),
            'tasks' => true,
            'telesales' => $this->canAccessTelesalesModule($user),
            'marketing' => $this->canAccessMarketingModule($user),
            'settings' => $this->canAccessSettingsModule($user),
            default => false,
        };
    }

    public function normalizeLocale(?string $locale): string
    {
        $locale = strtolower(trim((string) $locale));

        return str_starts_with($locale, 'ar') ? 'ar' : 'en';
    }

    public function localizeModule(array $module, string $locale): array
    {
        $locale = $this->normalizeLocale($locale);
        if ($locale !== 'ar') {
            return $module;
        }

        $localized = $module;
        if (! empty($module['name_ar'])) {
            $localized['name'] = $module['name_ar'];
        }
        if (! empty($module['description_ar'])) {
            $localized['description'] = $module['description_ar'];
        }
        if (! empty($module['copilot_ar']) && is_array($module['copilot_ar'])) {
            $localized['copilot'] = $module['copilot_ar'];
        }

        return $localized;
    }

    protected function normalizeMatchText(string $value): string
    {
        $value = mb_strtolower(trim($value));
        $value = str_replace(['إ', 'أ', 'آ', 'ى', 'ة'], ['ا', 'ا', 'ا', 'ي', 'ه'], $value);
        // Drop Arabic definite article so "الامبورتس" matches "امبورتس".
        $value = preg_replace('/(^|\s)ال(?=\p{Arabic})/u', '$1', $value) ?? $value;
        $value = preg_replace('/\s+/u', ' ', $value) ?? $value;

        return trim($value);
    }

    public function canShowReport(User $user, string $reportPermissionName): bool
    {
        if ($reportPermissionName === 'Customers Report' && $this->isRealEstateTenant($user)) {
            return false;
        }

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
        if ($reportPermissionName === 'Customers Report' && $this->isRealEstateTenant($user)) {
            return false;
        }

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

    protected function canAccessLeadsModule(User $user): bool
    {
        $modulePermissions = data_get($user->meta_data, 'module_permissions', []);
        if (! is_array($modulePermissions)) {
            $modulePermissions = [];
        }

        $leadPerms = $modulePermissions['Leads'] ?? [];
        $controlPerms = $modulePermissions['Control'] ?? [];

        if (is_array($leadPerms) && $leadPerms !== []) {
            return true;
        }

        return is_array($controlPerms) && in_array('showReports', $controlPerms, true);
    }

    protected function canAccessReportsModule(User $user): bool
    {
        foreach (self::REPORTS as $report) {
            if ($this->canShowReport($user, $report['permission'])) {
                return true;
            }
        }

        $modulePermissions = data_get($user->meta_data, 'module_permissions', []);
        $controlPerms = is_array($modulePermissions) ? ($modulePermissions['Control'] ?? []) : [];

        return is_array($controlPerms) && in_array('showReports', $controlPerms, true);
    }

    protected function canAccessTelesalesModule(User $user): bool
    {
        $modulePermissions = data_get($user->meta_data, 'module_permissions', []);
        $telesalesPerms = is_array($modulePermissions) ? ($modulePermissions['Telesales'] ?? []) : [];

        return is_array($telesalesPerms) && in_array('showModule', $telesalesPerms, true);
    }

    protected function canAccessMarketingModule(User $user): bool
    {
        $role = strtolower(trim((string) ($user->role ?? '')));

        foreach ([
            'marketing',
            'director',
            'operation manager',
            'sales admin',
            'sales manager',
            'branch manager',
        ] as $needle) {
            if (str_contains($role, $needle)) {
                return true;
            }
        }

        return false;
    }

    protected function canAccessSettingsModule(User $user): bool
    {
        $role = strtolower(trim((string) ($user->role ?? '')));
        foreach (['director', 'operation manager', 'sales admin'] as $needle) {
            if (str_contains($role, $needle)) {
                return true;
            }
        }

        $modulePermissions = data_get($user->meta_data, 'module_permissions', []);
        $controlPerms = is_array($modulePermissions) ? ($modulePermissions['Control'] ?? []) : [];

        return is_array($controlPerms) && in_array('userManagement', $controlPerms, true);
    }

    protected function tenantHasTelesalesModule(User $user): bool
    {
        if (! $user->tenant_id) {
            return false;
        }

        try {
            if (! Schema::connection('landlord')->hasTable('tenant_modules')) {
                // If module tables are unavailable, fall back to permission-only gating.
                return true;
            }

            $tenant = Tenant::query()->find($user->tenant_id);
            if (! $tenant) {
                return false;
            }

            return $tenant->modules()
                ->where('modules.slug', 'telesales')
                ->where(function ($query) {
                    $query->where('tenant_modules.is_enabled', true)
                        ->orWhereNull('tenant_modules.is_enabled');
                })
                ->exists();
        } catch (\Throwable) {
            return true;
        }
    }

    protected function isRealEstateTenant(User $user): bool
    {
        $tenant = app()->bound('tenant') ? app('tenant') : null;
        if (! $tenant && $user->tenant_id) {
            $tenant = Tenant::query()->find($user->tenant_id);
        }
        $companyType = strtolower(trim((string) ($tenant?->company_type ?? '')));

        return $companyType !== '' && str_contains($companyType, 'real');
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
