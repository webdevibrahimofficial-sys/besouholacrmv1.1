<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\TenantMetaApp;
use App\Services\MetaAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\FacebookProvider;
use Mockery;
use Tests\TestCase;

class MetaOauthScopesTest extends TestCase
{
    use RefreshDatabase;

    public function test_minimal_mode_uses_public_profile_and_email_scopes(): void
    {
        $tenant = $this->createTenantMetaApp();

        config([
            'services.meta.mock_mode' => false,
            'services.meta.oauth_minimal_scopes' => true,
            'services.facebook.redirect' => 'https://api.besouholacrm.net/api/auth/meta/callback',
            'services.facebook.scopes' => ['pages_show_list', 'ads_read'],
        ]);

        $this->mockFacebookRedirectFlow(
            ['public_profile', 'email'],
            $tenant->id,
            'https://api.besouholacrm.net/api/auth/meta/callback',
            true
        );

        $url = app(MetaAuthService::class)->getRedirectUrl($tenant->id, 'state-token');

        $this->assertSame('https://facebook.test/oauth', $url);
    }

    public function test_normal_mode_uses_scopes_from_configuration(): void
    {
        $tenant = $this->createTenantMetaApp();

        config([
            'services.meta.mock_mode' => false,
            'services.meta.oauth_minimal_scopes' => false,
            'services.facebook.redirect' => 'https://api.besouholacrm.net/api/auth/meta/callback',
            'services.facebook.scopes' => ['public_profile', 'email', 'pages_show_list', 'ads_read'],
        ]);

        $this->mockFacebookRedirectFlow(
            ['public_profile', 'email', 'pages_show_list', 'ads_read'],
            $tenant->id,
            'https://api.besouholacrm.net/api/auth/meta/callback',
            false
        );

        $url = app(MetaAuthService::class)->getRedirectUrl($tenant->id, 'state-token');

        $this->assertSame('https://facebook.test/oauth', $url);
    }

    protected function createTenantMetaApp(): Tenant
    {
        $tenant = Tenant::create([
            'id' => 'tenant_meta_oauth',
            'name' => 'Tenant Meta OAuth',
            'slug' => 'tenant-meta-oauth',
            'status' => 'active',
        ]);

        TenantMetaApp::create([
            'tenant_id' => $tenant->id,
            'app_id' => 'tenant-app-id',
            'app_secret' => 'tenant-app-secret',
            'verify_token' => 'tenant-verify-token',
            'webhook_key' => 'tenant-webhook-key',
            'is_active' => true,
        ]);

        return $tenant;
    }

    protected function mockFacebookRedirectFlow(array $expectedScopes, $tenantId, string $redirectUri, bool $minimalMode): void
    {
        Log::shouldReceive('info')
            ->once()
            ->with(
                'Meta OAuth redirect initiated',
                Mockery::on(function (array $context) use ($tenantId, $redirectUri, $expectedScopes, $minimalMode) {
                    return (string) ($context['tenant_id'] ?? null) === (string) $tenantId
                        && ($context['app_id'] ?? null) === 'tenant-app-id'
                        && ($context['redirect_uri'] ?? null) === $redirectUri
                        && ($context['scopes'] ?? null) === $expectedScopes
                        && ($context['minimal_scope_mode'] ?? null) === $minimalMode;
                })
            );

        $provider = Mockery::mock(FacebookProvider::class);
        $redirect = Mockery::mock();

        Socialite::shouldReceive('buildProvider')
            ->once()
            ->with(FacebookProvider::class, Mockery::on(function (array $config) use ($redirectUri) {
                return ($config['client_id'] ?? null) === 'tenant-app-id'
                    && ($config['client_secret'] ?? null) === 'tenant-app-secret'
                    && ($config['redirect'] ?? null) === $redirectUri;
            }))
            ->andReturn($provider);

        $provider->shouldReceive('stateless')->once()->andReturnSelf();
        $provider->shouldReceive('scopes')->once()->with($expectedScopes)->andReturnSelf();
        $provider->shouldReceive('with')->once()->with(['state' => 'state-token'])->andReturnSelf();
        $provider->shouldReceive('redirect')->once()->andReturn($redirect);

        $redirect->shouldReceive('getTargetUrl')
            ->once()
            ->andReturn('https://facebook.test/oauth');
    }
}
