<?php

namespace App\Http\Controllers;

use App\Services\MetaCredentialsResolver;
use App\Services\MetaSystemSettingsService;
use App\Services\Whatsapp\WhatsappMetaAuthService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class WhatsappMetaAuthController extends Controller
{
    public function __construct(
        private readonly WhatsappMetaAuthService $whatsappMetaAuthService,
        private readonly MetaCredentialsResolver $credentialsResolver,
        private readonly MetaSystemSettingsService $metaSystemSettings,
    ) {
    }

    public function redirect(Request $request)
    {
        $user = $request->user();
        if (! $user?->tenant_id) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        if (! $this->whatsappMetaAuthService->isOauthEnabled()) {
            return response()->json([
                'error' => 'WhatsApp OAuth is not enabled yet. Use manual token entry until Meta App Review is approved.',
                'oauth_enabled' => false,
            ], 422);
        }

        try {
            $this->credentialsResolver->resolveForTenant($user->tenant_id);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'Shared Meta App is not configured. Please ask your system administrator.',
            ], 422);
        }

        $state = Str::random(64);
        Cache::put('whatsapp_oauth_state:' . $state, [
            'tenant_id' => $user->tenant_id,
            'user_id' => $user->id,
        ], now()->addMinutes(10));

        $url = $this->whatsappMetaAuthService->getRedirectUrl((int) $user->tenant_id, $state);

        return response()->json(['url' => $url]);
    }

    public function callback(Request $request)
    {
        $state = (string) $request->query('state', '');
        $cached = Cache::pull('whatsapp_oauth_state:' . $state);

        if (! is_array($cached) || empty($cached['tenant_id'])) {
            return redirect('/#/settings/integrations/whatsapp?whatsapp=error&reason=invalid_state');
        }

        if (! $this->whatsappMetaAuthService->isOauthEnabled()) {
            return redirect('/#/settings/integrations/whatsapp?whatsapp=error&reason=oauth_disabled');
        }

        try {
            $this->whatsappMetaAuthService->handleCallback(
                (string) $request->query('code', ''),
                (int) $cached['tenant_id'],
                (int) ($cached['user_id'] ?? 0)
            );
        } catch (\Throwable $e) {
            return redirect('/#/settings/integrations/whatsapp?whatsapp=error&reason=' . urlencode($e->getMessage()));
        }

        return redirect('/#/settings/integrations/whatsapp?whatsapp=connected');
    }

    /**
     * Complete Embedded Signup from the browser (FB.login + WA_EMBEDDED_SIGNUP session).
     */
    public function completeEmbedded(Request $request)
    {
        $user = $request->user();
        if (! $user?->tenant_id) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        if (! $this->whatsappMetaAuthService->isOauthEnabled()) {
            return response()->json([
                'error' => 'WhatsApp OAuth is not enabled yet.',
                'oauth_enabled' => false,
            ], 422);
        }

        $validated = $request->validate([
            'code' => 'required|string',
            'phone_number_id' => 'nullable|string',
            'waba_id' => 'nullable|string',
            'display_phone_number' => 'nullable|string',
            'verified_name' => 'nullable|string',
        ]);

        try {
            $this->credentialsResolver->resolveForTenant($user->tenant_id);
            $channels = $this->whatsappMetaAuthService->completeEmbeddedSignup(
                (int) $user->tenant_id,
                (int) $user->id,
                $validated['code'],
                [
                    'phone_number_id' => $validated['phone_number_id'] ?? null,
                    'waba_id' => $validated['waba_id'] ?? null,
                    'display_phone_number' => $validated['display_phone_number'] ?? null,
                    'verified_name' => $validated['verified_name'] ?? null,
                ]
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (\Throwable $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 422);
        }

        return response()->json([
            'ok' => true,
            'channels' => collect($channels)->map(fn ($channel) => [
                'id' => $channel->id,
                'display_name' => $channel->display_name,
                'phone_number' => $channel->phone_number,
                'phone_number_id' => $channel->phone_number_id,
                'status' => $channel->status,
                'is_primary' => (bool) $channel->is_primary,
            ])->values(),
        ]);
    }

    public function status(Request $request)
    {
        $user = $request->user();
        if (! $user?->tenant_id) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $credentials = [];
        try {
            $credentials = $this->credentialsResolver->resolveForTenant((int) $user->tenant_id);
        } catch (\Throwable $e) {
            $credentials = $this->metaSystemSettings->resolveSharedCredentials(false);
        }

        $oauthEnabled = $this->whatsappMetaAuthService->isOauthEnabled();
        $configId = $this->whatsappMetaAuthService->embeddedSignupConfigId();

        return response()->json([
            'shared_meta_configured' => $this->metaSystemSettings->isConfigured(),
            'whatsapp_oauth_enabled' => $oauthEnabled,
            'manual_token_default' => ! $oauthEnabled,
            'meta_app_id' => $credentials['app_id'] ?? null,
            'embedded_signup_config_id' => $configId,
            'embedded_signup_available' => $oauthEnabled && $configId !== null && ! empty($credentials['app_id']),
            'connect_mode' => ($oauthEnabled && $configId)
                ? 'embedded_signup'
                : ($oauthEnabled ? 'oauth_redirect' : 'manual'),
        ]);
    }
}
