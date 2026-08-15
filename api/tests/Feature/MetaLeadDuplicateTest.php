<?php

namespace Tests\Feature;

use App\Contracts\MetaApiClientInterface;
use App\Models\CrmSetting;
use App\Models\Integration;
use App\Models\Lead;
use App\Models\MetaConnection;
use App\Models\MetaPage;
use App\Models\Tenant;
use App\Services\MetaLeadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Mockery;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaLeadDuplicateTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    private function seedTenantWithPage(): array
    {
        $this->seedSharedMetaApp('123456', 'shared-secret', 'verify-token');

        $tenant = Tenant::create([
            'id' => 'tenant_meta_dup',
            'name' => 'Tenant Meta Dup',
            'slug' => 'tenant-meta-dup',
            'status' => 'active',
        ]);

        Integration::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'status' => 'active',
            'settings' => ['autoSync' => true],
        ]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-dup',
            'user_access_token' => 'token-dup',
        ]);

        $page = MetaPage::create([
            'tenant_id' => $tenant->id,
            'connection_id' => $connection->id,
            'page_id' => 'page-meta-dup',
            'page_name' => 'Dup Page',
            'page_token' => 'page-token-dup',
            'is_active' => true,
        ]);

        return [$tenant, $page];
    }

    private function mockLeadFetch(string $metaId, string $phone, string $name = 'Meta User'): void
    {
        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('get')
            ->once()
            ->with('/' . $metaId, Mockery::type('array'))
            ->andReturn([
                'id' => $metaId,
                'created_time' => now()->toIso8601String(),
                'form_id' => 'form-dup',
                'form_name' => 'Lead Form',
                'field_data' => [
                    ['name' => 'full_name', 'values' => [$name]],
                    ['name' => 'email', 'values' => ['meta@example.com']],
                    ['name' => 'phone_number', 'values' => [$phone]],
                ],
            ]);

        $this->app->instance(MetaApiClientInterface::class, $apiClient);
    }

    public function test_meta_lead_with_existing_phone_is_marked_duplicate(): void
    {
        Notification::fake();
        config(['services.meta.mock_mode' => false]);

        [$tenant, $page] = $this->seedTenantWithPage();
        CrmSetting::create([
            'tenant_id' => $tenant->id,
            'settings' => ['duplicationSystem' => true],
        ]);

        $original = Lead::create([
            'tenant_id' => $tenant->id,
            'name' => 'Original Lead',
            'phone' => '01012345678',
            'stage' => 'New Lead',
            'status' => 'pending',
            'source' => 'Manual',
        ]);

        $this->mockLeadFetch('meta-dup-1', '+201012345678');
        app()->instance('current_tenant_id', $tenant->id);
        app(MetaLeadService::class)->processLead($tenant->id, 'meta-dup-1', $page->page_id);

        $duplicate = Lead::query()
            ->where('tenant_id', $tenant->id)
            ->where('meta_id', 'meta-dup-1')
            ->first();

        $this->assertNotNull($duplicate);
        $this->assertSame('duplicate', strtolower((string) $duplicate->status));
        $this->assertSame('duplicate', strtolower((string) $duplicate->stage));
        $this->assertSame($original->id, (int) ($duplicate->meta_data['duplicate_of'] ?? 0));
        $this->assertSame('New Lead', $original->fresh()->stage);
    }

    public function test_same_meta_lead_retry_does_not_mark_original_as_duplicate(): void
    {
        config(['services.meta.mock_mode' => false]);

        [$tenant, $page] = $this->seedTenantWithPage();
        CrmSetting::create([
            'tenant_id' => $tenant->id,
            'settings' => ['duplicationSystem' => true],
        ]);

        $this->mockLeadFetch('meta-first-1', '01098765432');
        app()->instance('current_tenant_id', $tenant->id);
        app(MetaLeadService::class)->processLead($tenant->id, 'meta-first-1', $page->page_id);

        $this->mockLeadFetch('meta-first-1', '01098765432');
        app(MetaLeadService::class)->processLead($tenant->id, 'meta-first-1', $page->page_id);

        $lead = Lead::query()
            ->where('tenant_id', $tenant->id)
            ->where('meta_id', 'meta-first-1')
            ->first();

        $this->assertNotNull($lead);
        $this->assertNotSame('duplicate', strtolower((string) $lead->status));
        $this->assertSame('New Lead', $lead->stage);
        $this->assertSame(1, Lead::query()->where('tenant_id', $tenant->id)->count());
    }

    public function test_meta_lead_skips_duplicate_when_setting_disabled(): void
    {
        config(['services.meta.mock_mode' => false]);

        [$tenant, $page] = $this->seedTenantWithPage();
        CrmSetting::create([
            'tenant_id' => $tenant->id,
            'settings' => ['duplicationSystem' => false],
        ]);

        Lead::create([
            'tenant_id' => $tenant->id,
            'name' => 'Original Lead',
            'phone' => '01012345678',
            'stage' => 'New Lead',
            'source' => 'Manual',
        ]);

        $this->mockLeadFetch('meta-dup-off', '01012345678');
        app()->instance('current_tenant_id', $tenant->id);
        app(MetaLeadService::class)->processLead($tenant->id, 'meta-dup-off', $page->page_id);

        $metaLead = Lead::query()
            ->where('tenant_id', $tenant->id)
            ->where('meta_id', 'meta-dup-off')
            ->first();

        $this->assertNotNull($metaLead);
        $this->assertNotSame('duplicate', strtolower((string) $metaLead->status));
        $this->assertSame('New Lead', $metaLead->stage);
    }
}
