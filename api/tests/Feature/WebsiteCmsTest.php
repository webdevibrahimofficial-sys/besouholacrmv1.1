<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WebsiteCmsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        config(['owner_website.tenant_slug' => 'besouhola']);

        $this->tenant = Tenant::factory()->create([
            'status' => 'active',
            'slug' => 'besouhola',
            'name' => 'Be Souhola',
        ]);

        $this->superAdmin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($this->superAdmin);
    }

    public function test_system_cms_settings_bootstrap_and_update(): void
    {
        $response = $this->getJson('/api/system/company-website/settings');
        $response->assertOk()
            ->assertJsonPath('company_name', 'Be Souhola');

        $update = $this->putJson('/api/system/company-website/settings', [
            'company_name' => 'Be Souhola CRM',
            'phone' => '+20 100 000 0000',
        ]);

        $update->assertOk()
            ->assertJsonPath('company_name', 'Be Souhola CRM')
            ->assertJsonPath('phone', '+20 100 000 0000');
    }

    public function test_homepage_sections_bootstrap_and_update(): void
    {
        $response = $this->getJson('/api/system/company-website/homepage-sections');
        $response->assertOk();

        $hero = collect($response->json())->firstWhere('type', 'hero');
        $this->assertNotNull($hero);

        $update = $this->putJson('/api/system/company-website/homepage-sections/' . $hero['id'], [
            'content' => [
                'headline' => 'Updated Headline',
                'headline_accent' => 'Updated Accent',
            ],
        ]);

        $update->assertOk()
            ->assertJsonPath('content.headline', 'Updated Headline');
    }

    public function test_services_crud(): void
    {
        $list = $this->getJson('/api/system/company-website/services');
        $list->assertOk();
        $this->assertGreaterThanOrEqual(1, count($list->json()));

        $create = $this->postJson('/api/system/company-website/services', [
            'name' => 'Custom Service',
            'short_description' => 'Short copy',
            'description' => 'Long copy',
            'is_active' => true,
        ]);

        $create->assertCreated()
            ->assertJsonPath('name', 'Custom Service')
            ->assertJsonPath('slug', 'custom-service');

        $serviceId = (int) $create->json('id');

        $update = $this->putJson('/api/system/company-website/services/' . $serviceId, [
            'name' => 'Custom Service Updated',
            'is_active' => false,
        ]);

        $update->assertOk()
            ->assertJsonPath('name', 'Custom Service Updated')
            ->assertJsonPath('is_active', false);

        $this->deleteJson('/api/system/company-website/services/' . $serviceId)
            ->assertNoContent();
    }

    public function test_public_website_content_endpoint(): void
    {
        $this->getJson('/api/system/company-website/settings');
        $this->getJson('/api/system/company-website/homepage-sections');
        $this->getJson('/api/system/company-website/services');

        $response = $this->getJson('/api/public/website/besouhola');

        $response->assertOk()
            ->assertJsonPath('tenant.slug', 'besouhola')
            ->assertJsonPath('settings.company_name', 'Be Souhola')
            ->assertJsonStructure([
                'tenant',
                'settings',
                'sections',
                'services',
            ]);
    }

    public function test_public_website_returns_404_for_unknown_tenant(): void
    {
        $this->getJson('/api/public/website/unknown-tenant')
            ->assertNotFound();
    }
}
