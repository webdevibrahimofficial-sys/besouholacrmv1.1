<?php

namespace Tests\Feature;

use App\Contracts\MetaApiClientInterface;
use App\Models\Integration;
use App\Models\Lead;
use App\Models\LeadAction;
use App\Models\MetaConnection;
use App\Models\MetaPage;
use App\Models\Revenue;
use App\Models\Tenant;
use App\Models\User;
use App\Services\MetaLeadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaCapiLifecycleEventsTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    protected function createTenantWithCapi(array $events, string $slug = 'capi-lifecycle'): Tenant
    {
        $tenant = Tenant::create([
            'id' => 'tenant_' . $slug,
            'name' => 'Tenant ' . $slug,
            'slug' => $slug,
            'status' => 'active',
        ]);

        Integration::create([
            'tenant_id' => $tenant->id,
            'provider' => 'meta',
            'status' => 'active',
            'settings' => [
                'enableCapi' => true,
                'pixelId' => '9876543210',
                'events' => $events,
            ],
        ]);

        return $tenant;
    }

    public function test_crm_lead_creation_sends_lead_event_once_when_enabled(): void
    {
        config(['services.meta.mock_mode' => false]);
        $this->seedSharedMetaApp();
        $tenant = $this->createTenantWithCapi(['Lead' => true], 'crm-lead-once');

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('post')
            ->once()
            ->with('/9876543210/events', Mockery::on(function (array $payload) {
                $event = $payload['data'][0] ?? [];

                return ($event['event_name'] ?? null) === 'Lead'
                    && str_starts_with((string) ($event['event_id'] ?? ''), 'crm_lead_')
                    && str_ends_with((string) ($event['event_id'] ?? ''), '_created')
                    && isset($event['user_data']['em']);
            }))
            ->andReturn(['events_received' => 1]);
        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        Lead::create([
            'tenant_id' => $tenant->id,
            'name' => 'CRM Lead',
            'email' => 'crm@example.com',
            'phone' => '201111111111',
            'source' => 'Website',
        ]);
    }

    public function test_meta_lead_creation_sends_exactly_one_lead_event(): void
    {
        config(['services.meta.mock_mode' => false]);
        $this->seedSharedMetaApp();
        $tenant = $this->createTenantWithCapi(['Lead' => true], 'meta-lead-once');

        $connection = MetaConnection::create([
            'tenant_id' => $tenant->id,
            'fb_user_id' => 'fb-user-1',
            'user_access_token' => 'token-1',
        ]);

        MetaPage::create([
            'tenant_id' => $tenant->id,
            'connection_id' => $connection->id,
            'page_id' => 'page-capi-once',
            'page_name' => 'CAPI Page',
            'page_token' => 'page-token',
            'is_active' => true,
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('get')
            ->once()
            ->andReturn([
                'id' => 'mock_meta_lead_once',
                'created_time' => now()->toIso8601String(),
                'form_id' => 'form-1',
                'form_name' => 'Form',
                'field_data' => [
                    ['name' => 'email', 'values' => ['meta@example.com']],
                    ['name' => 'full_name', 'values' => ['Meta User']],
                    ['name' => 'phone_number', 'values' => ['+201234567890']],
                ],
            ]);
        $apiClient->shouldReceive('post')
            ->once()
            ->with('/9876543210/events', Mockery::on(function (array $payload) {
                $event = $payload['data'][0] ?? [];

                return ($event['event_name'] ?? null) === 'Lead'
                    && ($event['event_id'] ?? null) === 'meta_lead_mock_meta_lead_once';
            }))
            ->andReturn(['events_received' => 1]);
        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        app(MetaLeadService::class)->processLead($tenant->id, 'mock_meta_lead_once', 'page-capi-once');
    }

    public function test_lead_event_respects_events_toggle(): void
    {
        config(['services.meta.mock_mode' => false]);
        $this->seedSharedMetaApp();
        $tenant = $this->createTenantWithCapi(['Lead' => false], 'lead-toggle-off');

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldNotReceive('post');
        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        Lead::create([
            'tenant_id' => $tenant->id,
            'name' => 'No CAPI Lead',
            'email' => 'off@example.com',
        ]);
    }

    public function test_complete_registration_fires_only_on_first_lead_action(): void
    {
        config(['services.meta.mock_mode' => false]);
        $this->seedSharedMetaApp();
        $tenant = $this->createTenantWithCapi([
            'Lead' => false,
            'CompleteRegistration' => true,
        ], 'complete-reg');

        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $lead = Lead::create([
            'tenant_id' => $tenant->id,
            'name' => 'Reg Lead',
            'email' => 'reg@example.com',
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('post')
            ->once()
            ->with('/9876543210/events', Mockery::on(function (array $payload) use ($lead) {
                $event = $payload['data'][0] ?? [];

                return ($event['event_name'] ?? null) === 'CompleteRegistration'
                    && ($event['event_id'] ?? null) === 'crm_lead_' . $lead->id . '_registered';
            }))
            ->andReturn(['events_received' => 1]);
        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        LeadAction::create([
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'action_type' => 'call',
            'description' => 'First contact',
        ]);

        LeadAction::create([
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'action_type' => 'call',
            'description' => 'Second contact',
        ]);
    }

    public function test_purchase_fires_per_revenue_row_with_amount_and_currency(): void
    {
        config(['services.meta.mock_mode' => false]);
        $this->seedSharedMetaApp();
        $tenant = $this->createTenantWithCapi([
            'Lead' => false,
            'Purchase' => true,
        ], 'purchase-rows');

        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $lead = Lead::create([
            'tenant_id' => $tenant->id,
            'name' => 'Buyer',
            'email' => 'buyer@example.com',
            'phone' => '201000000001',
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldReceive('post')
            ->twice()
            ->with('/9876543210/events', Mockery::on(function (array $payload) {
                $event = $payload['data'][0] ?? [];
                $custom = $event['custom_data'] ?? [];

                return ($event['event_name'] ?? null) === 'Purchase'
                    && str_starts_with((string) ($event['event_id'] ?? ''), 'revenue_')
                    && isset($custom['value'], $custom['currency'])
                    && (float) $custom['value'] > 0
                    && $custom['currency'] === 'EGP';
            }))
            ->andReturn(['events_received' => 1]);
        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        Revenue::create([
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'lead_id' => $lead->id,
            'amount' => 1000,
            'currency' => 'EGP',
            'source' => 'Manual',
        ]);

        Revenue::create([
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'lead_id' => $lead->id,
            'amount' => 500,
            'currency' => 'EGP',
            'source' => 'Manual',
        ]);
    }

    public function test_purchase_respects_events_toggle(): void
    {
        config(['services.meta.mock_mode' => false]);
        $this->seedSharedMetaApp();
        $tenant = $this->createTenantWithCapi([
            'Lead' => false,
            'Purchase' => false,
        ], 'purchase-off');

        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $lead = Lead::create([
            'tenant_id' => $tenant->id,
            'name' => 'No Purchase',
            'email' => 'nopurchase@example.com',
        ]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldNotReceive('post');
        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        Revenue::create([
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'lead_id' => $lead->id,
            'amount' => 250,
            'currency' => 'USD',
            'source' => 'Manual',
        ]);
    }

    public function test_mock_mode_short_circuits_all_lifecycle_events(): void
    {
        config(['services.meta.mock_mode' => true]);
        $this->seedSharedMetaApp();
        $tenant = $this->createTenantWithCapi([
            'Lead' => true,
            'CompleteRegistration' => true,
            'Purchase' => true,
        ], 'mock-mode');

        $user = User::factory()->create(['tenant_id' => $tenant->id]);

        $apiClient = Mockery::mock(MetaApiClientInterface::class);
        $apiClient->shouldNotReceive('post');
        $this->app->instance(MetaApiClientInterface::class, $apiClient);

        $lead = Lead::create([
            'tenant_id' => $tenant->id,
            'name' => 'Mock Lead',
            'email' => 'mock@example.com',
        ]);

        LeadAction::create([
            'lead_id' => $lead->id,
            'user_id' => $user->id,
            'action_type' => 'call',
            'description' => 'First',
        ]);

        Revenue::create([
            'tenant_id' => $tenant->id,
            'user_id' => $user->id,
            'lead_id' => $lead->id,
            'amount' => 100,
            'currency' => 'EGP',
            'source' => 'Manual',
        ]);

        $this->assertTrue(true);
    }
}
