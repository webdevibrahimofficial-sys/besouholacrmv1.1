<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Services\MetaAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\FacebookProvider;
use Mockery;
use Tests\Support\SeedsSharedMetaApp;
use Tests\TestCase;

class MetaOauthScopesTest extends TestCase
{
    use RefreshDatabase;
    use SeedsSharedMetaApp;

    public function test_minimal_mode_uses_public_profile_and_email_scopes(): void
    {
        $tenant = $this->createTenant();

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
        $tenant = $this->createTenant();

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

    protected function createTenant(): Tenant
    {
        $tenant = Tenant::create([
            'id' => 'tenant_meta_oauth',
            'name' => 'Tenant Meta OAuth',
            'slug' => 'tenant-meta-oauth',
            'status' => 'active',
        ]);

        $this->seedSharedMetaApp('shared-app-id', 'shared-app-secret', 'shared-verify-token');

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
                        && ($context['app_id'] ?? null) === 'shared-app-id'
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
                return ($config['client_id'] ?? null) === 'shared-app-id'
                    && ($config['client_secret'] ?? null) === 'shared-app-secret'
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
