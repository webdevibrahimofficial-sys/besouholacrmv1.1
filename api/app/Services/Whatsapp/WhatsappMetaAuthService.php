<?php

namespace App\Services\Whatsapp;

use App\Models\WhatsappChannel;
use App\Models\WhatsappSetting;
use App\Services\MetaAccessTokenService;
use App\Services\MetaCredentialsResolver;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Laravel\Socialite\Two\FacebookProvider;
use Laravel\Socialite\Facades\Socialite;

class WhatsappMetaAuthService
{
    protected string $apiVersion = 'v21.0';

    public function __construct(
        private readonly MetaCredentialsResolver $credentialsResolver,
        private readonly MetaAccessTokenService $accessTokenService,
        private readonly WhatsappChannelService $channelService,
        private readonly WhatsappChannelConflictService $conflictService,
    ) {
    }

    public function isOauthEnabled(): bool
    {
        return (bool) config('services.whatsapp.oauth_enabled', false);
    }

    public function embeddedSignupConfigId(): ?string
    {
        $id = trim((string) config('services.whatsapp.embedded_signup_config_id', ''));

        return $id !== '' ? $id : null;
    }

    public function resolveOauthScopes(): array
    {
        return config('services.whatsapp.scopes', [
            'whatsapp_business_management',
            'whatsapp_business_messaging',
            'business_management',
        ]);
    }

    public function getRedirectUrl(int $tenantId, string $state): string
    {
        if (! $this->isOauthEnabled()) {
            throw new \RuntimeException('WhatsApp OAuth is not enabled yet.');
        }

        // WhatsApp always uses the platform shared Meta App (not tenant BYOA).
        $credentials = $this->credentialsResolver->resolveShared();

        /** @var FacebookProvider $driver */
        $driver = Socialite::buildProvider(FacebookProvider::class, [
            'client_id' => $credentials['app_id'],
            'client_secret' => $credentials['app_secret'],
            'redirect' => route('whatsapp.meta.callback'),
        ]);

        return $driver
            ->stateless()
            ->scopes($this->resolveOauthScopes())
            ->with(['state' => $state])
            ->redirect()
            ->getTargetUrl();
    }

    /**
     * Classic OAuth redirect callback (Facebook Login → discover WABA phones).
     */
    public function handleCallback(string $code, int $tenantId, int $userId): array
    {
        if (! $this->isOauthEnabled()) {
            throw new \RuntimeException('WhatsApp OAuth is not enabled yet.');
        }

        if (trim($code) === '') {
            throw new \RuntimeException('Missing OAuth authorization code.');
        }

        $accessToken = $this->exchangeAuthorizationCode($tenantId, $code);
        $discovered = $this->discoverPhoneNumbers($accessToken);

        if ($discovered === []) {
            throw new \RuntimeException(
                'No WhatsApp Business phone numbers were found on this Meta account. Complete WhatsApp setup in Meta Business Manager, or use Embedded Signup.'
            );
        }

        return $this->persistDiscoveredChannels($tenantId, $userId, $accessToken, $discovered);
    }

    /**
     * One-step Embedded Signup completion: code from FB.login + phone/waba from session event.
     *
     * @param  array{phone_number_id?: string, waba_id?: string, display_phone_number?: string, verified_name?: string}  $session
     */
    public function completeEmbeddedSignup(int $tenantId, int $userId, string $code, array $session = []): array
    {
        if (! $this->isOauthEnabled()) {
            throw new \RuntimeException('WhatsApp OAuth is not enabled yet.');
        }

        if (trim($code) === '') {
            throw ValidationException::withMessages([
                'code' => ['Missing Embedded Signup authorization code.'],
            ]);
        }

        $accessToken = $this->exchangeAuthorizationCode($tenantId, $code);

        $phoneNumberId = trim((string) ($session['phone_number_id'] ?? ''));
        $wabaId = trim((string) ($session['waba_id'] ?? ''));

        if ($phoneNumberId !== '') {
            $display = $session['display_phone_number'] ?? null;
            $verified = $session['verified_name'] ?? null;

            if (! $display || ! $verified) {
                $details = $this->fetchPhoneNumberDetails($accessToken, $phoneNumberId);
                $display = $display ?: ($details['display_phone_number'] ?? null);
                $verified = $verified ?: ($details['verified_name'] ?? null);
            }

            $discovered = [[
                'phone_number_id' => $phoneNumberId,
                'display_phone_number' => $display,
                'verified_name' => $verified,
                'waba_id' => $wabaId !== '' ? $wabaId : null,
            ]];
        } else {
            $discovered = $this->discoverPhoneNumbers($accessToken);
        }

        if ($discovered === []) {
            throw ValidationException::withMessages([
                'session' => [
                    'Embedded Signup finished but no phone number was returned. Try again or use manual token entry.',
                ],
            ]);
        }

        return $this->persistDiscoveredChannels($tenantId, $userId, $accessToken, $discovered);
    }

    /**
     * @param  array<int, array<string, mixed>>  $discovered
     * @return array<int, WhatsappChannel>
     */
    public function persistDiscoveredChannels(
        int $tenantId,
        int $userId,
        string $accessToken,
        array $discovered
    ): array {
        $channels = [];

        foreach ($discovered as $item) {
            $phoneNumberId = trim((string) ($item['phone_number_id'] ?? ''));
            if ($phoneNumberId === '') {
                continue;
            }

            $existingForTenant = WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('phone_number_id', $phoneNumberId)
                ->first();

            $normalizedPhone = $this->channelService->normalizePhone($item['display_phone_number'] ?? null);
            if ($normalizedPhone) {
                $this->conflictService->assertNoActivePhoneConflict(
                    $tenantId,
                    $normalizedPhone,
                    WhatsappChannel::PROVIDER_META_CLOUD,
                    (int) ($existingForTenant?->id ?? 0)
                );
            }

            $this->conflictService->assertNoActivePhoneNumberIdConflict(
                $phoneNumberId,
                (int) ($existingForTenant?->id ?? 0)
            );

            $channel = WhatsappChannel::query()->updateOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'phone_number_id' => $phoneNumberId,
                ],
                [
                    'provider' => WhatsappChannel::PROVIDER_META_CLOUD,
                    'display_name' => $item['verified_name'] ?? $item['display_phone_number'] ?? 'Meta Cloud API',
                    'phone_number' => $item['display_phone_number'] ?? null,
                    'normalized_phone' => $normalizedPhone,
                    'business_account_id' => $item['waba_id'] ?? null,
                    'access_token' => $accessToken,
                    'status' => WhatsappChannel::STATUS_CONNECTED,
                    'supports_inbound' => true,
                    'supports_outbound' => true,
                    'supports_ctwa_attribution' => true,
                    'connected_by_user_id' => $userId ?: null,
                    'last_connected_at' => now(),
                    'last_error' => null,
                ]
            );

            $channels[] = $channel;
        }

        if ($channels === []) {
            throw new \RuntimeException('No WhatsApp channels could be saved.');
        }

        $primary = $this->channelService->findPrimaryOutboundChannel($tenantId, WhatsappChannel::PROVIDER_META_CLOUD);
        if (! $primary) {
            $primary = $this->channelService->setPrimary($tenantId, (int) $channels[0]->id);
        }

        $this->syncLegacySettings($tenantId, $primary, $accessToken);

        return $channels;
    }

    public function exchangeAuthorizationCode(int $tenantId, string $code): string
    {
        // WhatsApp always uses the platform shared Meta App (not tenant BYOA).
        $credentials = $this->credentialsResolver->resolveShared();

        $response = Http::asForm()->post("https://graph.facebook.com/{$this->apiVersion}/oauth/access_token", [
            'client_id' => $credentials['app_id'],
            'client_secret' => $credentials['app_secret'],
            'code' => $code,
        ]);

        if (! $response->successful() || empty($response->json('access_token'))) {
            Log::warning('WhatsApp OAuth: code exchange failed', [
                'status' => $response->status(),
                'body' => $response->json(),
            ]);

            throw new \RuntimeException('Failed to exchange Meta authorization code for an access token.');
        }

        $shortToken = (string) $response->json('access_token');
        $longLived = $this->accessTokenService->exchangeForLongLivedToken($shortToken, $tenantId, true);

        return (string) ($longLived['access_token'] ?? $shortToken);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function discoverPhoneNumbers(string $accessToken): array
    {
        $results = [];
        $businesses = Http::get("https://graph.facebook.com/{$this->apiVersion}/me/businesses", [
            'access_token' => $accessToken,
            'fields' => 'id,name',
        ]);

        if (! $businesses->successful()) {
            Log::warning('WhatsApp OAuth: failed to list businesses', ['body' => $businesses->json()]);

            return [];
        }

        foreach ($businesses->json('data', []) as $business) {
            $businessId = $business['id'] ?? null;
            if (! $businessId) {
                continue;
            }

            $wabaResponse = Http::get("https://graph.facebook.com/{$this->apiVersion}/{$businessId}/owned_whatsapp_business_accounts", [
                'access_token' => $accessToken,
                'fields' => 'id,name',
            ]);

            if (! $wabaResponse->successful()) {
                continue;
            }

            foreach ($wabaResponse->json('data', []) as $waba) {
                $wabaId = $waba['id'] ?? null;
                if (! $wabaId) {
                    continue;
                }

                $phonesResponse = Http::get("https://graph.facebook.com/{$this->apiVersion}/{$wabaId}/phone_numbers", [
                    'access_token' => $accessToken,
                    'fields' => 'id,display_phone_number,verified_name,quality_rating',
                ]);

                if (! $phonesResponse->successful()) {
                    continue;
                }

                foreach ($phonesResponse->json('data', []) as $phone) {
                    $results[] = [
                        'phone_number_id' => $phone['id'] ?? null,
                        'display_phone_number' => $phone['display_phone_number'] ?? null,
                        'verified_name' => $phone['verified_name'] ?? null,
                        'waba_id' => $wabaId,
                    ];
                }
            }
        }

        return array_values(array_filter($results, fn ($row) => ! empty($row['phone_number_id'])));
    }

    /**
     * @return array<string, mixed>
     */
    private function fetchPhoneNumberDetails(string $accessToken, string $phoneNumberId): array
    {
        $response = Http::get("https://graph.facebook.com/{$this->apiVersion}/{$phoneNumberId}", [
            'access_token' => $accessToken,
            'fields' => 'id,display_phone_number,verified_name',
        ]);

        return $response->successful() ? ($response->json() ?: []) : [];
    }

    private function syncLegacySettings(int $tenantId, WhatsappChannel $channel, string $accessToken): void
    {
        WhatsappSetting::query()->updateOrCreate(
            ['tenant_id' => $tenantId],
            [
                'provider' => 'meta',
                'api_key' => $accessToken,
                'phone_number_id' => $channel->phone_number_id,
                'business_number' => $channel->phone_number,
                'business_account_id' => $channel->business_account_id,
                'status' => true,
            ]
        );
    }
}
