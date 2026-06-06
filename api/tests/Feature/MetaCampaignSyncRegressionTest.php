<?php

namespace Tests\Feature;

use App\Models\Ad;
use App\Models\AdSet;
use App\Models\Campaign;
use App\Models\CampaignInsight;
use App\Models\Tenant;
use App\Models\TenantMetaApp;
use App\Services\MetaAuthService;
use App\Services\MetaCampaignService;
use App\Services\MetaInsightService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class MetaCampaignSyncRegressionTest extends TestCase
{
    use RefreshDatabase;

    protected Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'id' => 'meta_campaign_regression_tenant',
            'name' => 'Meta Campaign Regression Tenant',
            'slug' => 'meta-campaign-regression-tenant',
            'status' => 'active',
        ]);

        TenantMetaApp::create([
            'tenant_id' => $this->tenant->id,
            'app_id' => 'tenant-app-id',
            'app_secret' => 'tenant-app-secret',
            'verify_token' => 'tenant-verify-token',
            'webhook_key' => 'tenant-webhook-key',
            'is_active' => true,
        ]);

        config([
            'services.meta.mock_mode' => true,
            'services.meta.mock_failure_probability' => 0,
            'queue.meta_connection' => 'sync',
        ]);

        app(MetaAuthService::class)->handleSocialUser($this->tenant->id, [
            'id' => 'mock_user_id',
            'token' => 'mock_token',
            'name' => 'Mock User',
            'email' => 'mock@example.com',
        ]);
    }

    public function test_campaign_sync_creates_campaign_with_meta_metrics(): void
    {
        app(MetaCampaignService::class)->syncAll($this->tenant->id);

        $campaign = Campaign::where('tenant_id', $this->tenant->id)
            ->where('meta_id', 'mock_campaign_1')
            ->firstOrFail();

        $this->assertSame('Mock Campaign 1', $campaign->name);
        $this->assertSame('meta', $campaign->provider);
        $this->assertEquals(1000, $campaign->impressions);
        $this->assertEquals(50, $campaign->clicks);
        $this->assertEquals('100.00', (string) $campaign->spend);
        $this->assertEquals(5, $campaign->leads);
        $this->assertEquals('-1.00', (string) $campaign->roi);
    }

    public function test_adset_and_ad_sync_link_to_campaign_hierarchy(): void
    {
        $this->assertTrue(Schema::hasColumn('ad_sets', 'meta_id'));
        $this->assertTrue(Schema::hasColumn('ads', 'meta_id'));

        app(MetaCampaignService::class)->syncAll($this->tenant->id);

        $campaign = Campaign::where('tenant_id', $this->tenant->id)
            ->where('meta_id', 'mock_campaign_1')
            ->firstOrFail();

        $adSet = AdSet::where('tenant_id', $this->tenant->id)
            ->where('meta_id', 'mock_adset_1')
            ->firstOrFail();

        $ad = Ad::where('tenant_id', $this->tenant->id)
            ->where('meta_id', 'mock_ad_1')
            ->firstOrFail();

        $this->assertSame($campaign->id, $adSet->campaign_id);
        $this->assertSame($campaign->id, $ad->campaign_id);
        $this->assertSame($adSet->id, $ad->ad_set_id);
    }

    public function test_insight_sync_is_idempotent_and_stores_daily_metrics(): void
    {
        $service = app(MetaInsightService::class);

        $service->syncInsights($this->tenant->id, 3);
        $service->syncInsights($this->tenant->id, 3);

        $this->assertSame(
            1,
            CampaignInsight::where('tenant_id', $this->tenant->id)
                ->where('meta_campaign_id', 'mock_campaign_1')
                ->count()
        );

        $insight = CampaignInsight::where('tenant_id', $this->tenant->id)
            ->where('meta_campaign_id', 'mock_campaign_1')
            ->firstOrFail();

        $this->assertEquals(2000, $insight->impressions);
        $this->assertEquals(100, $insight->clicks);
        $this->assertEquals('150.00', (string) $insight->spend);
        $this->assertEquals('5.0000', (string) $insight->ctr);
        $this->assertEquals('1.50', (string) $insight->cpc);
        $this->assertEquals('75.00', (string) $insight->cpm);
    }
}
