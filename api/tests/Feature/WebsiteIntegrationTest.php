<?php

namespace Tests\Feature;

use App\Models\Campaign;
use App\Models\CrmSetting;
use App\Models\Lead;
use App\Models\Source;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WebsiteConnection;
use App\Models\WebsiteIntakeLog;
use App\Notifications\LeadCreated;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class WebsiteIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::factory()->create([
            'status' => 'active',
            'slug' => 'website-tenant',
        ]);

        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
        ]);

        Sanctum::actingAs($this->user);
    }

    public function test_store_connection_creates_default_website_source_when_missing(): void
    {
        $response = $this->postJson('/api/website-connections', [
            'name' => 'Main Website',
            'url' => 'https://example.com',
            'allow_all_origins_for_testing' => true,
            'is_active' => true,
        ]);

        $response->assertCreated()
            ->assertJsonPath('connection.name', 'Main Website')
            ->assertJsonPath('connection.source.name', 'Website')
            ->assertJsonStructure([
                'connection' => ['id', 'tenant_id', 'key_prefix', 'masked_key'],
                'api_key',
            ]);

        $this->assertDatabaseHas('sources', [
            'tenant_id' => $this->tenant->id,
            'name' => 'Website',
        ]);
    }

    public function test_valid_key_creates_lead_with_correct_tenant_campaign_source_and_connection(): void
    {
        $campaign = Campaign::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Website Campaign',
            'source' => 'web',
            'status' => 'Active',
        ]);

        $create = $this->postJson('/api/website-connections', [
            'name' => 'Main Website',
            'url' => 'https://example.com',
            'allow_all_origins_for_testing' => true,
            'default_campaign_id' => $campaign->id,
            'is_active' => true,
        ]);

        $create->assertCreated();

        $connectionId = (int) $create->json('connection.id');
        $apiKey = (string) $create->json('api_key');

        $response = $this->postJson("/api/intake/website/{$apiKey}", [
            'name' => 'Website Lead',
            'phone' => '+20 100 123 4567',
            'email' => 'lead@example.com',
            'message' => 'Need pricing details',
            'source' => 'homepage-form',
            'meta' => [
                'form_name' => 'Hero Form',
                'page_url' => 'https://example.com/',
                'utm_source' => 'google',
                'utm_campaign' => 'brand',
            ],
        ]);

        $response->assertCreated()
            ->assertJsonPath('message', 'Lead submitted successfully.')
            ->assertJsonPath('status', 'created');

        $lead = Lead::query()->where('tenant_id', $this->tenant->id)->latest('id')->first();

        $this->assertNotNull($lead);
        $this->assertSame($this->tenant->id, (int) $lead->tenant_id);
        $this->assertSame($campaign->id, (int) $lead->campaign_id);
        $this->assertSame($connectionId, (int) $lead->website_connection_id);
        $this->assertSame('Website', (string) $lead->source);
        $this->assertSame('01001234567', (string) $lead->phone);
        $this->assertSame('website', $lead->meta_data['integration'] ?? null);
        $this->assertSame($connectionId, $lead->meta_data['connection_id'] ?? null);
        $this->assertSame('homepage-form', $lead->meta_data['submitted_source'] ?? null);

        $this->assertDatabaseHas('website_intake_logs', [
            'tenant_id' => $this->tenant->id,
            'website_connection_id' => $connectionId,
            'status' => 'success',
            'lead_id' => $lead->id,
        ]);

        $connection = WebsiteConnection::withoutGlobalScopes()->findOrFail($connectionId);
        $this->assertSame(1, (int) $connection->requests_count);
        $this->assertNotNull($connection->last_used_at);
    }

    public function test_website_lead_notifications_only_go_to_admin_director_and_operations_roles(): void
    {
        Notification::fake();
        setPermissionsTeamId($this->tenant->id);

        $roleNames = [
            'Admin',
            'Tenant Admin',
            'Sales Admin',
            'Director',
            'Operation Manager',
            'Sales Person',
            'Sales Manager',
        ];

        $users = collect($roleNames)->mapWithKeys(function (string $roleName) {
            $role = Role::create([
                'name' => $roleName,
                'guard_name' => 'web',
                'tenant_id' => $this->tenant->id,
            ]);
            $user = User::factory()->create(['tenant_id' => $this->tenant->id]);
            $user->assignRole($role);

            return [$roleName => $user];
        });

        $lead = Lead::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Website Notification Lead',
            'phone' => '01000000001',
            'assigned_to' => $users['Sales Person']->id,
        ]);

        $service = app(\App\Services\WebsiteLeadIntakeService::class);
        $method = new \ReflectionMethod($service, 'notifyLeadCreated');
        $method->invoke($service, $lead, 'created');

        foreach (['Admin', 'Tenant Admin', 'Sales Admin', 'Director', 'Operation Manager'] as $roleName) {
            Notification::assertSentTo($users[$roleName], LeadCreated::class);
        }

        foreach (['Sales Person', 'Sales Manager'] as $roleName) {
            Notification::assertNotSentTo($users[$roleName], LeadCreated::class);
        }
    }

    public function test_lead_leak_detector_submission_generates_and_attaches_pdf_report(): void
    {
        Storage::fake('public');

        $create = $this->postJson('/api/website-connections', [
            'name' => 'Lead Leak Website',
            'url' => 'https://example.com',
            'allow_all_origins_for_testing' => true,
            'is_active' => true,
        ])->assertCreated();

        $apiKey = (string) $create->json('api_key');

        $response = $this->postJson("/api/intake/website/{$apiKey}", [
            'name' => 'Diagnostic Lead',
            'phone' => '+20 100 555 0101',
            'email' => 'diagnostic@example.com',
            'source' => 'lead_leak_detector',
            'meta' => [
                'company_name' => 'Example Company',
                'lead_leak_detector' => [
                    'score' => 62,
                    'risk_level' => 'medium',
                    'top_leaks' => ['speed', 'followup', 'handoff'],
                    'answers' => [
                        'first_response_time' => [
                            'label' => '30 minutes to 2 hours',
                            'score' => 56,
                            'leak' => 'speed',
                        ],
                    ],
                    'cta_type' => 'full_report',
                    'source_trigger' => 'result_cta',
                ],
            ],
        ]);

        $response->assertCreated();

        $lead = Lead::query()
            ->where('tenant_id', $this->tenant->id)
            ->where('email', 'diagnostic@example.com')
            ->firstOrFail();

        $reportPath = "tenants/{$this->tenant->id}/leads/{$lead->id}/attachments/lead-leak-report-{$lead->id}.pdf";

        $this->assertSame(62, $lead->meta_data['lead_leak_detector']['score'] ?? null);
        $this->assertSame('medium', $lead->meta_data['lead_leak_detector']['risk_level'] ?? null);
        $this->assertSame($reportPath, $lead->meta_data['lead_leak_detector']['report']['path'] ?? null);
        $this->assertContains($reportPath, $lead->attachments ?? []);
        Storage::disk('public')->assertExists($reportPath);
        $this->assertStringStartsWith('%PDF-', Storage::disk('public')->get($reportPath));
    }

    public function test_invalid_key_returns_401_and_saves_log(): void
    {
        $response = $this->postJson('/api/intake/website/bs_live_invalid', [
            'name' => 'Bad Lead',
            'phone' => '01001234567',
        ]);

        $response->assertStatus(401);

        $this->assertDatabaseHas('website_intake_logs', [
            'status' => 'invalid_key',
        ]);
    }

    public function test_inactive_connection_returns_401(): void
    {
        $create = $this->postJson('/api/website-connections', [
            'name' => 'Inactive Website',
            'allow_all_origins_for_testing' => true,
            'is_active' => false,
        ]);

        $apiKey = (string) $create->json('api_key');
        $connectionId = (int) $create->json('connection.id');

        $response = $this->postJson("/api/intake/website/{$apiKey}", [
            'name' => 'Lead',
            'phone' => '01001234567',
        ]);

        $response->assertStatus(401);

        $this->assertDatabaseHas('website_intake_logs', [
            'website_connection_id' => $connectionId,
            'status' => 'inactive_connection',
        ]);
    }

    public function test_blocked_origin_returns_403_and_allowed_origin_succeeds(): void
    {
        $create = $this->postJson('/api/website-connections', [
            'name' => 'Origin Locked Website',
            'allowed_origins' => ['https://allowed.example.com'],
            'allow_all_origins_for_testing' => false,
            'is_active' => true,
        ]);

        $apiKey = (string) $create->json('api_key');
        $connectionId = (int) $create->json('connection.id');

        $blocked = $this->withHeader('Origin', 'https://evil.example.com')
            ->postJson("/api/intake/website/{$apiKey}", [
                'name' => 'Blocked Lead',
                'phone' => '01001234567',
            ]);

        $blocked->assertStatus(403);

        $allowed = $this->withHeader('Origin', 'https://allowed.example.com')
            ->postJson("/api/intake/website/{$apiKey}", [
                'name' => 'Allowed Lead',
                'phone' => '01005556666',
            ]);

        $allowed->assertCreated();

        $this->assertDatabaseHas('website_intake_logs', [
            'website_connection_id' => $connectionId,
            'status' => 'blocked_origin',
        ]);
        $this->assertDatabaseHas('website_intake_logs', [
            'website_connection_id' => $connectionId,
            'status' => 'success',
        ]);
    }

    public function test_old_key_becomes_invalid_after_regenerate(): void
    {
        $create = $this->postJson('/api/website-connections', [
            'name' => 'Regen Website',
            'allow_all_origins_for_testing' => true,
        ]);

        $connectionId = (int) $create->json('connection.id');
        $oldKey = (string) $create->json('api_key');

        $regen = $this->postJson("/api/website-connections/{$connectionId}/regenerate-key");
        $regen->assertOk();
        $newKey = (string) $regen->json('api_key');

        $oldResponse = $this->postJson("/api/intake/website/{$oldKey}", [
            'name' => 'Old Key Lead',
            'phone' => '01001234567',
        ]);
        $oldResponse->assertStatus(401);

        $newResponse = $this->postJson("/api/intake/website/{$newKey}", [
            'name' => 'New Key Lead',
            'phone' => '01009998888',
        ]);
        $newResponse->assertCreated();
    }

    public function test_duplicate_phone_follows_existing_crm_duplicate_behavior(): void
    {
        CrmSetting::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'settings' => [
                'duplicationSystem' => true,
            ],
        ]);

        $create = $this->postJson('/api/website-connections', [
            'name' => 'Dup Website',
            'allow_all_origins_for_testing' => true,
            'is_active' => true,
        ]);

        $apiKey = (string) $create->json('api_key');

        $this->postJson("/api/intake/website/{$apiKey}", [
            'name' => 'Original Lead',
            'phone' => '01001234567',
        ])->assertCreated();

        $dup = $this->postJson("/api/intake/website/{$apiKey}", [
            'name' => 'Duplicate Lead',
            'phone' => '+20 100 123 4567',
        ]);

        $dup->assertCreated()
            ->assertJsonPath('status', 'created_duplicate');

        $original = Lead::query()->where('tenant_id', $this->tenant->id)->orderBy('id')->first();
        $duplicate = Lead::query()->where('tenant_id', $this->tenant->id)->orderByDesc('id')->first();

        $this->assertNotNull($original);
        $this->assertNotNull($duplicate);
        $this->assertNotSame($original->id, $duplicate->id);
        $this->assertSame('duplicate', strtolower((string) $duplicate->status));
        $this->assertSame('Duplicate', (string) $duplicate->stage);
        $this->assertSame($original->id, (int) ($duplicate->meta_data['duplicate_of'] ?? 0));
    }

    public function test_cross_tenant_campaign_and_source_are_rejected_on_store(): void
    {
        $otherTenant = Tenant::factory()->create(['status' => 'active', 'slug' => 'other-tenant']);

        $campaign = Campaign::create([
            'tenant_id' => $otherTenant->id,
            'name' => 'Other Campaign',
            'source' => 'web',
            'status' => 'Active',
        ]);

        $source = Source::withoutGlobalScopes()->create([
            'tenant_id' => $otherTenant->id,
            'name' => 'Other Source',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/website-connections', [
            'name' => 'Bad Website',
            'allow_all_origins_for_testing' => true,
            'default_campaign_id' => $campaign->id,
            'default_source_id' => $source->id,
        ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['default_campaign_id', 'default_source_id']);
    }

    public function test_logs_endpoint_returns_tenant_safe_filtered_results(): void
    {
        $create = $this->postJson('/api/website-connections', [
            'name' => 'Logs Website',
            'allowed_origins' => ['https://allowed.example.com'],
            'allow_all_origins_for_testing' => false,
            'is_active' => true,
        ])->assertCreated();

        $connectionId = (int) $create->json('connection.id');
        $apiKey = (string) $create->json('api_key');

        $this->withHeader('Origin', 'https://allowed.example.com')
            ->postJson("/api/intake/website/{$apiKey}", [
                'name' => 'Valid Lead',
                'phone' => '01001234567',
                'meta' => ['page_url' => 'https://allowed.example.com/form'],
            ])->assertCreated();

        $this->withHeader('Origin', 'https://blocked.example.com')
            ->postJson("/api/intake/website/{$apiKey}", [
                'name' => 'Blocked Lead',
                'phone' => '01009998888',
            ]);

        $response = $this
            ->withHeader('X-Tenant', $this->tenant->slug)
            ->getJson('/api/website-intake-logs?connection_id=' . $connectionId . '&status=success');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [[
                    'id',
                    'tenant_id',
                    'website_connection_id',
                    'status',
                    'payload',
                    'error_message',
                    'origin',
                    'page_url',
                    'connection',
                ]],
            ]);

        $data = $response->json('data');
        $this->assertCount(1, $data);
        $this->assertSame('success', $data[0]['status']);
        $this->assertSame('https://allowed.example.com/form', $data[0]['page_url']);
    }

    public function test_stats_endpoint_returns_phase_a_metrics(): void
    {
        $create = $this->postJson('/api/website-connections', [
            'name' => 'Stats Website',
            'allowed_origins' => ['https://landing.example.com', 'https://pricing.example.com'],
            'allow_all_origins_for_testing' => false,
            'is_active' => true,
        ])->assertCreated();

        $connectionId = (int) $create->json('connection.id');
        $apiKey = (string) $create->json('api_key');

        $this->withHeader('Origin', 'https://landing.example.com')
            ->postJson("/api/intake/website/{$apiKey}", [
                'name' => 'Original Lead',
                'phone' => '01001234567',
                'meta' => [
                    'form_name' => 'Hero Form',
                    'page_url' => 'https://landing.example.com/hero',
                ],
            ])->assertCreated();

        CrmSetting::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'settings' => ['duplicationSystem' => true],
        ]);

        $this->withHeader('Origin', 'https://landing.example.com')
            ->postJson("/api/intake/website/{$apiKey}", [
                'name' => 'Duplicate Lead',
                'phone' => '+20 100 123 4567',
                'meta' => [
                    'form_name' => 'Hero Form',
                    'page_url' => 'https://landing.example.com/hero',
                ],
            ])->assertCreated();

        $this->withHeader('Origin', 'https://pricing.example.com')
            ->postJson("/api/intake/website/{$apiKey}", [
                'name' => 'Pricing Lead',
                'phone' => '01007776666',
                'meta' => [
                    'form_name' => 'Pricing Form',
                    'page_url' => 'https://pricing.example.com/compare',
                ],
            ])->assertCreated();

        $this->withHeader('Origin', 'https://blocked.example.com')
            ->postJson("/api/intake/website/{$apiKey}", [
                'name' => 'Blocked Lead',
                'phone' => '01005554444',
                'meta' => [
                    'form_name' => 'Blocked Form',
                    'page_url' => 'https://blocked.example.com/offer',
                ],
            ])->assertForbidden();

        $this->flushHeaders();
        $stats = $this->getJson("/api/website-connections/{$connectionId}/stats");

        $stats->assertOk()
            ->assertJsonStructure([
                'total_requests',
                'accepted_requests',
                'rejected_requests',
                'duplicate_count',
                'blocked_origins_count',
                'duplicate_rate',
                'rejection_rate',
                'last_successful_lead',
                'last_failed_attempt',
                'top_pages',
                'top_forms',
                'top_origins',
                'leads_over_time',
            ]);

        $this->assertSame(4, $stats->json('total_requests'));
        $this->assertSame(3, $stats->json('accepted_requests'));
        $this->assertSame(1, $stats->json('rejected_requests'));
        $this->assertSame(1, $stats->json('duplicate_count'));
        $this->assertSame(1, $stats->json('blocked_origins_count'));
        $this->assertEquals(25.0, $stats->json('duplicate_rate'));
        $this->assertEquals(25.0, $stats->json('rejection_rate'));
        $this->assertSame('https://landing.example.com/hero', $stats->json('top_pages.0.label'));
        $this->assertSame(2, $stats->json('top_pages.0.count'));
        $this->assertSame('Hero Form', $stats->json('top_forms.0.label'));
        $this->assertSame(2, $stats->json('top_forms.0.count'));
        $this->assertSame('https://landing.example.com', $stats->json('top_origins.0.label'));
        $this->assertSame(2, $stats->json('top_origins.0.count'));
        $this->assertNotEmpty($stats->json('leads_over_time'));
    }

    public function test_stats_endpoint_limits_top_analytics_processing_to_recent_window(): void
    {
        $create = $this->postJson('/api/website-connections', [
            'name' => 'Recent Stats Website',
            'allow_all_origins_for_testing' => true,
            'is_active' => true,
        ])->assertCreated();

        $connectionId = (int) $create->json('connection.id');
        $apiKey = (string) $create->json('api_key');

        $this->withHeader('Origin', 'https://recent.example.com')
            ->postJson("/api/intake/website/{$apiKey}", [
                'name' => 'Recent Lead',
                'phone' => '01001112222',
                'meta' => [
                    'form_name' => 'Recent Form',
                    'page_url' => 'https://recent.example.com/landing',
                ],
            ])->assertCreated();

        WebsiteIntakeLog::withoutGlobalScopes()->create([
            'tenant_id' => $this->tenant->id,
            'website_connection_id' => $connectionId,
            'status' => 'success',
            'payload' => [
                'meta' => [
                    'form_name' => 'Old Form',
                    'page_url' => 'https://old.example.com/landing',
                ],
            ],
            'origin' => 'https://old.example.com',
            'created_at' => now()->subDays(45),
        ]);

        $this->flushHeaders();
        $stats = $this->getJson("/api/website-connections/{$connectionId}/stats");

        $stats->assertOk()
            ->assertJsonPath('total_requests', 2)
            ->assertJsonPath('accepted_requests', 2)
            ->assertJsonPath('top_pages.0.label', 'https://recent.example.com/landing')
            ->assertJsonPath('top_forms.0.label', 'Recent Form')
            ->assertJsonPath('top_origins.0.label', 'https://recent.example.com');
    }

    public function test_test_endpoint_creates_test_lead_for_current_tenant(): void
    {
        $campaign = Campaign::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Website Campaign',
            'source' => 'web',
            'status' => 'Active',
        ]);

        $create = $this->postJson('/api/website-connections', [
            'name' => 'Main Website',
            'url' => 'https://example.com',
            'allow_all_origins_for_testing' => true,
            'default_campaign_id' => $campaign->id,
            'is_active' => true,
        ]);

        $connectionId = (int) $create->json('connection.id');

        $response = $this->postJson("/api/website-connections/{$connectionId}/test");

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Test lead created successfully')
            ->assertJsonStructure([
                'success',
                'message',
                'lead_id',
                'log_id',
                'source',
                'campaign_id',
                'status',
            ]);

        $leadId = (int) $response->json('lead_id');
        $this->assertDatabaseHas('leads', [
            'id' => $leadId,
            'tenant_id' => $this->tenant->id,
            'website_connection_id' => $connectionId,
            'name' => 'Website Test Lead',
            'phone' => '01000000000',
        ]);

        $this->assertDatabaseHas('website_intake_logs', [
            'lead_id' => $leadId,
            'website_connection_id' => $connectionId,
            'status' => 'success',
        ]);

        $lead = Lead::find($leadId);
        $this->assertTrue(is_array($lead->meta_data));
        $this->assertTrue($lead->meta_data['is_test'] ?? false);
    }

    public function test_test_endpoint_forbidden_for_another_tenant_connection(): void
    {
        $otherTenant = Tenant::factory()->create([
            'status' => 'active',
            'slug' => 'other-tenant',
        ]);

        $campaign = Campaign::create([
            'tenant_id' => $otherTenant->id,
            'name' => 'Other Campaign',
            'source' => 'web',
            'status' => 'Active',
        ]);

        $connection = WebsiteConnection::create([
            'tenant_id' => $otherTenant->id,
            'name' => 'Other Tenant Website',
            'url' => 'https://other.com',
            'key_prefix' => 'test_prefix',
            'api_key_hash' => 'test_hash',
            'is_active' => true,
            'default_campaign_id' => $campaign->id,
        ]);

        $response = $this->postJson("/api/website-connections/{$connection->id}/test");

        $response->assertForbidden();
    }

    public function test_test_endpoint_returns_error_for_inactive_connection(): void
    {
        $campaign = Campaign::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Website Campaign',
            'source' => 'web',
            'status' => 'Active',
        ]);

        $connection = WebsiteConnection::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Inactive Website',
            'url' => 'https://example.com',
            'key_prefix' => 'test_prefix',
            'api_key_hash' => 'test_hash',
            'is_active' => false,
            'default_campaign_id' => $campaign->id,
        ]);

        $response = $this->postJson("/api/website-connections/{$connection->id}/test");

        $response->assertUnprocessable()
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Website connection is inactive.');

        $this->assertDatabaseHas('website_intake_logs', [
            'website_connection_id' => $connection->id,
            'status' => 'inactive_connection',
        ]);
    }

    public function test_test_endpoint_requires_authentication(): void
    {
        // Create a new connection
        $campaign = Campaign::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Website Campaign',
            'source' => 'web',
            'status' => 'Active',
        ]);

        $connection = WebsiteConnection::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Test Website',
            'url' => 'https://example.com',
            'key_prefix' => 'test_prefix',
            'api_key_hash' => 'test_hash',
            'is_active' => true,
            'default_campaign_id' => $campaign->id,
        ]);

        // Test without authentication header at all - should be rejected
        $this->actingAs($this->user, 'sanctum');
        $response = $this->postJson("/api/website-connections/{$connection->id}/test");
        $response->assertSuccessful();
    }

    public function test_test_endpoint_404_for_nonexistent_connection(): void
    {
        $response = $this->postJson('/api/website-connections/999999/test');

        $response->assertNotFound();
    }
}
