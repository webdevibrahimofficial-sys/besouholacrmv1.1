<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Models\WebsiteConnection;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SystemCompanyWebsiteTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $ownerTenant;
    private User $superAdmin;
    private User $regularUser;

    protected function setUp(): void
    {
        parent::setUp();

        config(['owner_website.tenant_slug' => 'besouhola']);

        $this->ownerTenant = Tenant::factory()->create([
            'status' => 'active',
            'slug' => 'besouhola',
            'name' => 'Be Souhola',
        ]);

        $otherTenant = Tenant::factory()->create([
            'status' => 'active',
            'slug' => 'other-tenant',
        ]);

        $this->superAdmin = User::factory()->create([
            'tenant_id' => $this->ownerTenant->id,
            'is_super_admin' => true,
        ]);

        $this->regularUser = User::factory()->create([
            'tenant_id' => $otherTenant->id,
            'is_super_admin' => false,
        ]);
    }

    public function test_super_admin_can_manage_owner_company_website_settings(): void
    {
        Sanctum::actingAs($this->superAdmin);

        $response = $this->getJson('/api/system/company-website/settings');
        $response->assertOk()
            ->assertJsonPath('company_name', 'Be Souhola');

        $update = $this->putJson('/api/system/company-website/settings', [
            'company_name' => 'Be Souhola Platform',
        ]);

        $update->assertOk()
            ->assertJsonPath('company_name', 'Be Souhola Platform');

        $this->assertDatabaseHas('website_settings', [
            'tenant_id' => $this->ownerTenant->id,
            'company_name' => 'Be Souhola Platform',
        ]);
    }

    public function test_system_cms_uses_owner_tenant_not_current_user_tenant(): void
    {
        Sanctum::actingAs($this->superAdmin);

        $this->getJson('/api/system/company-website/settings')->assertOk();

        $this->assertDatabaseHas('website_settings', [
            'tenant_id' => $this->ownerTenant->id,
        ]);
    }

    public function test_regular_user_cannot_access_system_company_website(): void
    {
        Sanctum::actingAs($this->regularUser);

        $this->getJson('/api/system/company-website/settings')
            ->assertForbidden();
    }

    public function test_legacy_tenant_cms_routes_are_removed(): void
    {
        Sanctum::actingAs($this->superAdmin);

        $this->getJson('/api/website-cms/settings')->assertMethodNotAllowed();
        $this->getJson('/api/website-analytics/overview')->assertMethodNotAllowed();
    }

    public function test_public_website_endpoint_still_serves_owner_tenant_content(): void
    {
        Sanctum::actingAs($this->superAdmin);
        $this->getJson('/api/system/company-website/settings')->assertOk();

        $response = $this->getJson('/api/public/website/besouhola');
        $response->assertOk()
            ->assertJsonPath('tenant.slug', 'besouhola')
            ->assertJsonPath('settings.company_name', 'Be Souhola');
    }

    public function test_website_leads_integration_routes_remain_available(): void
    {
        Sanctum::actingAs($this->regularUser);

        $this->getJson('/api/website-connections')->assertOk();
    }
}
