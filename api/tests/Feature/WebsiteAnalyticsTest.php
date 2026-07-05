<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WebsiteEvent;
use App\Models\WebsitePageView;
use App\Models\WebsiteSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WebsiteAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::factory()->create([
            'status' => 'active',
            'slug' => 'besouhola',
        ]);

        config(['owner_website.tenant_slug' => 'besouhola']);

        $this->user = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'is_super_admin' => true,
        ]);

        Sanctum::actingAs($this->user);
    }

    public function test_public_event_creates_session_event_and_page_view(): void
    {
        $response = $this->postJson('/api/public/website/events', [
            'tenant_slug' => 'besouhola',
            'session_id' => 'sess_test_001',
            'event_name' => 'page_view',
            'page_url' => 'http://localhost:3000/',
            'page_path' => '/',
            'utm_source' => 'google',
            'utm_campaign' => 'brand',
            'utm_medium' => 'cpc',
            'referrer' => 'https://google.com',
            'device' => 'desktop',
            'browser' => 'Chrome',
            'timestamp' => now()->toIso8601String(),
        ]);

        $response->assertCreated()
            ->assertJsonPath('session_id', 'sess_test_001');

        $this->assertDatabaseHas('website_sessions', [
            'tenant_id' => $this->tenant->id,
            'session_id' => 'sess_test_001',
            'utm_source' => 'google',
        ]);

        $this->assertDatabaseHas('website_events', [
            'tenant_id' => $this->tenant->id,
            'session_id' => 'sess_test_001',
            'event_name' => 'page_view',
        ]);

        $this->assertDatabaseHas('website_page_views', [
            'tenant_id' => $this->tenant->id,
            'session_id' => 'sess_test_001',
            'page_path' => '/',
        ]);
    }

    public function test_form_events_and_overview_metrics(): void
    {
        $this->postJson('/api/public/website/events', [
            'tenant_slug' => 'besouhola',
            'session_id' => 'sess_form_001',
            'event_name' => 'page_view',
            'page_url' => 'http://localhost:3000/contact',
            'page_path' => '/contact',
            'device' => 'desktop',
            'browser' => 'Chrome',
        ])->assertCreated();

        $this->postJson('/api/public/website/events', [
            'tenant_slug' => 'besouhola',
            'session_id' => 'sess_form_001',
            'event_name' => 'form_view',
            'page_path' => '/contact',
            'form_name' => 'Contact Page Form',
            'device' => 'desktop',
            'browser' => 'Chrome',
        ])->assertCreated();

        $this->postJson('/api/public/website/events', [
            'tenant_slug' => 'besouhola',
            'session_id' => 'sess_form_001',
            'event_name' => 'form_start',
            'page_path' => '/contact',
            'form_name' => 'Contact Page Form',
            'device' => 'desktop',
            'browser' => 'Chrome',
        ])->assertCreated();

        $this->postJson('/api/public/website/events', [
            'tenant_slug' => 'besouhola',
            'session_id' => 'sess_form_001',
            'event_name' => 'form_submit',
            'page_path' => '/contact',
            'form_name' => 'Contact Page Form',
            'device' => 'desktop',
            'browser' => 'Chrome',
        ])->assertCreated();

        Lead::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Analytics Lead',
            'phone' => '01000000001',
            'source' => 'Website',
            'meta_data' => [
                'integration' => 'website',
                'session_id' => 'sess_form_001',
                'utm_source' => 'google',
                'utm_campaign' => 'brand',
            ],
        ]);

        $overview = $this->getJson('/api/system/company-website/analytics/overview');
        $overview->assertOk()
            ->assertJsonPath('sessions', 1)
            ->assertJsonPath('page_views', 1)
            ->assertJsonPath('leads', 1)
            ->assertJsonPath('form_starts', 1)
            ->assertJsonPath('form_submits', 1);

        $forms = $this->getJson('/api/system/company-website/analytics/forms');
        $forms->assertOk();
        $this->assertSame('Contact Page Form', $forms->json('0.form_name'));
        $this->assertSame(1, $forms->json('0.submits'));

        $pages = $this->getJson('/api/system/company-website/analytics/pages');
        $pages->assertOk();
        $this->assertSame('/contact', $pages->json('0.page_path'));

        $campaigns = $this->getJson('/api/system/company-website/analytics/campaigns');
        $campaigns->assertOk();
    }

    public function test_invalid_event_name_is_rejected(): void
    {
        $this->postJson('/api/public/website/events', [
            'tenant_slug' => 'besouhola',
            'session_id' => 'sess_invalid',
            'event_name' => 'unknown_event',
        ])->assertStatus(422);
    }

    public function test_analytics_filters_by_utm_and_device(): void
    {
        WebsiteSession::query()->create([
            'tenant_id' => $this->tenant->id,
            'session_id' => 'sess_google_desktop',
            'utm_source' => 'google',
            'utm_medium' => 'cpc',
            'utm_campaign' => 'brand',
            'device' => 'desktop',
            'started_at' => now()->subDay(),
            'last_seen_at' => now()->subDay(),
        ]);

        WebsiteSession::query()->create([
            'tenant_id' => $this->tenant->id,
            'session_id' => 'sess_meta_mobile',
            'utm_source' => 'meta',
            'utm_medium' => 'social',
            'utm_campaign' => 'summer',
            'device' => 'mobile',
            'started_at' => now()->subDay(),
            'last_seen_at' => now()->subDay(),
        ]);

        WebsitePageView::query()->create([
            'tenant_id' => $this->tenant->id,
            'session_id' => 'sess_google_desktop',
            'page_path' => '/pricing',
            'utm_source' => 'google',
            'utm_medium' => 'cpc',
            'utm_campaign' => 'brand',
            'device' => 'desktop',
            'viewed_at' => now()->subDay(),
        ]);

        WebsitePageView::query()->create([
            'tenant_id' => $this->tenant->id,
            'session_id' => 'sess_meta_mobile',
            'page_path' => '/contact',
            'utm_source' => 'meta',
            'utm_medium' => 'social',
            'utm_campaign' => 'summer',
            'device' => 'mobile',
            'viewed_at' => now()->subDay(),
        ]);

        WebsiteEvent::query()->create([
            'tenant_id' => $this->tenant->id,
            'session_id' => 'sess_google_desktop',
            'event_name' => 'form_submit',
            'form_name' => 'Pricing Demo',
            'page_path' => '/pricing',
            'utm_source' => 'google',
            'utm_medium' => 'cpc',
            'utm_campaign' => 'brand',
            'device' => 'desktop',
            'occurred_at' => now()->subDay(),
        ]);

        WebsiteEvent::query()->create([
            'tenant_id' => $this->tenant->id,
            'session_id' => 'sess_meta_mobile',
            'event_name' => 'form_submit',
            'form_name' => 'Contact Form',
            'page_path' => '/contact',
            'utm_source' => 'meta',
            'utm_medium' => 'social',
            'utm_campaign' => 'summer',
            'device' => 'mobile',
            'occurred_at' => now()->subDay(),
        ]);

        Lead::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Google Desktop Lead',
            'phone' => '01000000002',
            'source' => 'Website',
            'meta_data' => [
                'integration' => 'website',
                'utm_source' => 'google',
                'utm_medium' => 'cpc',
                'utm_campaign' => 'brand',
            ],
        ]);

        Lead::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Meta Mobile Lead',
            'phone' => '01000000003',
            'source' => 'Website',
            'meta_data' => [
                'integration' => 'website',
                'utm_source' => 'meta',
                'utm_medium' => 'social',
                'utm_campaign' => 'summer',
            ],
        ]);

        $query = http_build_query([
            'utm_source' => 'google',
            'utm_medium' => 'cpc',
            'utm_campaign' => 'brand',
            'device' => 'desktop',
        ]);

        $overview = $this->getJson('/api/system/company-website/analytics/overview?' . $query);
        $overview->assertOk()
            ->assertJsonPath('sessions', 1)
            ->assertJsonPath('visitors', 1)
            ->assertJsonPath('page_views', 1)
            ->assertJsonPath('leads', 1)
            ->assertJsonPath('form_submits', 1);

        $pages = $this->getJson('/api/system/company-website/analytics/pages?' . $query);
        $pages->assertOk()
            ->assertJsonPath('0.page_path', '/pricing')
            ->assertJsonPath('0.views', 1);

        $forms = $this->getJson('/api/system/company-website/analytics/forms?' . $query);
        $forms->assertOk()
            ->assertJsonPath('0.form_name', 'Pricing Demo')
            ->assertJsonPath('0.submits', 1);

        $campaigns = $this->getJson('/api/system/company-website/analytics/campaigns?' . $query);
        $campaigns->assertOk()
            ->assertJsonPath('0.utm_source', 'google')
            ->assertJsonPath('0.sessions', 1)
            ->assertJsonPath('0.leads', 1);
    }
}
