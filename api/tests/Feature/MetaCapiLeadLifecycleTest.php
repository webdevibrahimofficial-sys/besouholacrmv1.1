<?php

namespace Tests\Feature;

use App\Contracts\MetaApiClientInterface;
use App\Models\Integration;
use App\Models\MetaConnection;
use App\Models\MetaPage;
use App\Models\Tenant;
use App\Services\MetaLeadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaCapiLeadLifecycleTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    public function test_new_meta_lead_triggers_capi_event_when_enabled(): void
    {
        config([
            'services.meta.mock_mode' => false,
            'services.meta.mock_failure_probability' => 0,
        ]);
        $this->seedSharedMetaApp('123456', 'shared-secret', 'verify-token');

        $tenant = Tenant::create([
            'id' => 'tenant_capi_lead',
            'name' => 'Tenant CAPI Lead',
            'slug' => 'tenant-capi-lead',
            'status' => 'active',
        ]);

        Integration::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'status' => 'active',
            'settings' => [
                'enableCapi' => true,
                'pixelId' => '9876543210',
                'events' => ['Lead' => true],
            ],
        ]);

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'token-1',
        ]);

        $page = MetaPage::create([
            'tenant_id' => $tenant->id,
            'connection_id' => $connection->id,
            'page_id' => 'page-capi-lead',
            'page_name' => 'CAPI Lead Page',
            'page_token' => 'page-token',
            'is_active' => true,
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('get')
            ->once()
            ->with(Mockery::type('string'), Mockery::type('array'))
            ->andReturn([
                'id' => 'mock_lead_capi_1',
                'created_time' => now()->toIso8601String(),
                'form_id' => 'mock_form_1',
                'form_name' => 'Mock Form',
                'field_data' => [
                    ['name' => 'email', 'values' => ['lead@example.com']],
                    ['name' => 'full_name', 'values' => ['Lead User']],
                    ['name' => 'phone_number', 'values' => ['+201234567890']],
                ],
            ]);

        $apiClient->shouldReceive('post')
            ->once()
            ->with('/9876543210/events', Mockery::on(function (array $payload) {
                $event = $payload['data'][0] ?? [];
                return ($event['event_name'] ?? null) === 'Lead'
                    && ($event['action_source'] ?? null) === 'system_generated'
                    && isset($event['user_data']['em'])
                    && str_contains((string) ($payload['access_token'] ?? ''), '|');
            }))
            ->andReturn(['events_received' => 1]);

        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        app(MetaLeadService::class)->processLead($tenant->id, 'mock_lead_capi_1', $page->page_id);

        $this->assertDatabaseHas('leads', [
            'tenant_id' => $tenant->id,
            'meta_id' => 'mock_lead_capi_1',
            'email' => 'lead@example.com',
        ]);
    }

    public function test_duplicate_meta_lead_does_not_resend_capi_event(): void
    {
        config([
            'services.meta.mock_mode' => false,
            'services.meta.mock_failure_probability' => 0,
        ]);
        $this->seedSharedMetaApp('123456', 'shared-secret', 'verify-token');

        $tenant = Tenant::create([
            'id' => 'tenant_capi_dedupe',
            'name' => 'Tenant CAPI Dedupe',
            'slug' => 'tenant-capi-dedupe',
            'status' => 'active',
        ]);

        Integration::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'status' => 'active',
            'settings' => [
                'enableCapi' => true,
                'pixelId' => '9876543210',
                'events' => ['Lead' => true],
            ],
        ]);

        MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'token-1',
        ]);

        MetaPage::create([
            'tenant_id' => $tenant->id,
            'connection_id' => MetaConnection::where('tenant_id', $tenant->id)->value('id'),
            'page_id' => 'page-capi-dedupe',
            'page_name' => 'CAPI Dedupe Page',
            'page_token' => 'page-token',
            'is_active' => true,
        ]);

        $leadPayload = [
            'id' => 'mock_lead_capi_dup',
            'created_time' => now()->toIso8601String(),
            'field_data' => [
                ['name' => 'email', 'values' => ['dup@example.com']],
                ['name' => 'full_name', 'values' => ['Dup User']],
            ],
        ];

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('get')
            ->twice()
            ->andReturn($leadPayload);
        $apiClient->shouldReceive('post')
            ->once()
            ->with('/9876543210/events', Mockery::type('array'))
            ->andReturn(['events_received' => 1]);

        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        $service = app(MetaLeadService::class);
        $service->processLead($tenant->id, 'mock_lead_capi_dup', 'page-capi-dedupe');
        $service->processLead($tenant->id, 'mock_lead_capi_dup', 'page-capi-dedupe');

        $this->assertSame(
            1,
            \App\Models\Lead::where('tenant_id', $tenant->id)->where('meta_id', 'mock_lead_capi_dup')->count()
        );
    }
}
