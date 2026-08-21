<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\TenantAdminModulePermissionService;
use PHPUnit\Framework\TestCase;

class TenantAdminModulePermissionServiceTest extends TestCase
{
    public function test_expand_meta_data_adds_add_lead_when_empty(): void
    {
        $service = new TenantAdminModulePermissionService();
        $expanded = $service->expandMetaData([]);

        $this->assertContains('addLead', $expanded['module_permissions']['Leads']);
        $this->assertContains('showModule', $expanded['module_permissions']['Customers']);
        $this->assertContains('Customers Report_show', $expanded['module_permissions']['Reports']);
    }

    public function test_expand_meta_data_excludes_customers_report_for_real_estate(): void
    {
        $service = new TenantAdminModulePermissionService();
        $expanded = $service->expandMetaData([], 'Real Estate');

        $this->assertArrayNotHasKey('Customers', $expanded['module_permissions']);
        $this->assertNotContains('Customers Report_show', $expanded['module_permissions']['Reports']);
        $this->assertNotContains('Customers Report_export', $expanded['module_permissions']['Reports']);
        $this->assertContains('Targets & Revenue_show', $expanded['module_permissions']['Reports']);
    }

    public function test_expand_meta_data_keeps_existing_permissions(): void
    {
        $service = new TenantAdminModulePermissionService();
        $expanded = $service->expandMetaData([
            'module_permissions' => [
                'Leads' => ['customLeadPerm'],
            ],
            'other' => 'keep',
        ]);

        $this->assertContains('addLead', $expanded['module_permissions']['Leads']);
        $this->assertContains('customLeadPerm', $expanded['module_permissions']['Leads']);
        $this->assertSame('keep', $expanded['other']);
    }

    public function test_is_tenant_admin_like_matches_job_title(): void
    {
        $service = new TenantAdminModulePermissionService();
        $user = new User(['job_title' => 'Tenant Admin']);

        $this->assertTrue($service->isTenantAdminLike($user));
        $this->assertFalse($service->isTenantAdminLike(new User(['job_title' => 'Sales Person'])));
        $this->assertTrue($service->isTenantAdminLike(new User(['job_title' => 'Sales Person']), true));
    }
}
