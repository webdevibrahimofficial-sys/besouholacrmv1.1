<?php

namespace App\Services;

use App\Models\User;

class TenantAdminModulePermissionService
{
    public const TENANT_ADMIN_ROLES = [
        'admin',
        'tenant admin',
        'tenant-admin',
    ];

    /**
     * Full module permission catalog used by web and mobile clients.
     * Tenant admins are privileged and must receive these in auth payloads
     * even when meta_data.module_permissions is empty in the database.
     *
     * @return array<string, list<string>>
     */
    public function catalog(?string $companyType = null): array
    {
        $reportModules = [
            'Leads Pipeline',
            'Sales Activities',
            'Meetings Report',
            'Reservations Report',
            'Cancellation Report',
            'Closed Deals',
            'Rent Report',
            'Proposals Report',
            'Check In Report',
            'Customers Report',
            'Targets & Revenue',
            'Imports Report',
            'Exports Report',
        ];

        if ($this->isRealEstateCompanyType($companyType)) {
            $reportModules = array_values(array_filter(
                $reportModules,
                fn ($module) => $module !== 'Customers Report'
            ));
        }

        $reportPerms = [];
        foreach ($reportModules as $module) {
            $reportPerms[] = $module.'_show';
            $reportPerms[] = $module.'_export';
        }

        $catalog = [
            'Leads' => [
                'addLead',
                'showCreator',
                'editInfo',
                'editPhone',
                'importLeads',
                'exportLeads',
                'viewDuplicateLeads',
                'actOnDuplicateLeads',
                'addAction',
                'receiveLeads',
            ],
            'Inventory' => [
                'addCategory',
                'addItems',
                'addProject',
                'addProperties',
                'viewAllProperties',
                'exportProject',
                'exportProperties',
                'exportCategory',
                'exportItem',
                'revertSoldProperty',
                'deleteInventory',
                'addBroker',
                'addDeveloper',
                'showRequests',
            ],
            'Marketing' => [
                'showMarketingDashboard',
                'showCampaign',
                'addLandingPage',
                'integration',
            ],
            'Telesales' => [
                'showModule',
                'addLead',
                'importLeads',
                'editLead',
                'deleteLead',
                'assignLead',
                'receiveLeads',
                'transferToSales',
                'viewDashboard',
                'viewReports',
                'viewHistoricalRecords',
                'viewDuplicateLeads',
                'bulkTransferToSales',
                'export',
            ],
            'Customers' => [
                'showModule',
                'convertFromLead',
                'addCustomer',
                'editInfo',
                'deleteCustomer',
            ],
            'ContractCollections' => [
                'showModule',
                'viewContracts',
                'viewInstallments',
                'payInstallment',
                'printReceipt',
                'exportReports',
            ],
            'Support' => [
                'showModule',
                'addTickets',
                'sla',
                'reports',
                'exportReports',
                'deleteTickets',
            ],
            'Control' => [
                'addRegions',
                'addArea',
                'addStage',
                'addSource',
                'userManagement',
                'addUsers',
                'editUsers',
                'toggleUsers',
                'changeUserPassword',
                'deleteUsers',
                'multiAction',
                'salesComment',
                'allowActionOnTeam',
                'assignLeads',
                'checkInOutApprovals',
                'showReports',
                'editConfigurationSettings',
                'addInputs',
                'addDepartment',
            ],
            'Reports' => $reportPerms,
        ];

        if ($this->isRealEstateCompanyType($companyType)) {
            unset($catalog['Customers']);
        }

        return $catalog;
    }

    public function isTenantAdminLike(User $user, bool $isPrimaryAdmin = false): bool
    {
        if ($isPrimaryAdmin) {
            return true;
        }

        $roleValues = collect([
            $user->job_title,
            $user->role,
        ]);

        if ($user->relationLoaded('roles')) {
            $roleValues = $roleValues->merge($user->roles->pluck('name'));
        }

        return $roleValues
            ->filter()
            ->map(fn ($value) => $this->normalizeRole((string) $value))
            ->contains(fn ($role) => in_array($role, self::TENANT_ADMIN_ROLES, true));
    }

    /**
     * @param  array<string, mixed>|null  $meta
     * @return array<string, mixed>
     */
    public function expandMetaData(?array $meta, ?string $companyType = null): array
    {
        $meta = is_array($meta) ? $meta : [];
        $current = is_array($meta['module_permissions'] ?? null) ? $meta['module_permissions'] : [];
        $expanded = [];

        foreach ($this->catalog($companyType) as $group => $permissions) {
            $existing = is_array($current[$group] ?? null) ? $current[$group] : [];
            $expanded[$group] = array_values(array_unique(array_merge($permissions, $existing)));
        }

        foreach ($current as $group => $permissions) {
            if (array_key_exists($group, $expanded)) {
                continue;
            }
            $expanded[$group] = is_array($permissions) ? array_values($permissions) : $permissions;
        }

        if ($this->isRealEstateCompanyType($companyType)) {
            unset($expanded['Customers']);
            if (is_array($expanded['Reports'] ?? null)) {
                $expanded['Reports'] = array_values(array_filter(
                    $expanded['Reports'],
                    fn ($perm) => ! str_starts_with((string) $perm, 'Customers Report')
                ));
            }
        }

        $meta['module_permissions'] = $expanded;

        return $meta;
    }

    public function persistIfIncomplete(User $user, ?string $companyType = null): void
    {
        $meta = is_array($user->meta_data) ? $user->meta_data : [];
        $leadPerms = is_array(data_get($meta, 'module_permissions.Leads'))
            ? data_get($meta, 'module_permissions.Leads')
            : [];

        if (in_array('addLead', $leadPerms, true)) {
            return;
        }

        $user->forceFill([
            'meta_data' => $this->expandMetaData($meta, $companyType),
        ])->save();
    }

    protected function normalizeRole(string $value): string
    {
        return strtolower(trim(preg_replace('/\s+/', ' ', str_replace(['_', '-'], ' ', $value)) ?? $value));
    }

    protected function isRealEstateCompanyType(?string $companyType): bool
    {
        $normalized = strtolower(trim((string) $companyType));

        return $normalized !== '' && str_contains($normalized, 'real');
    }
}
