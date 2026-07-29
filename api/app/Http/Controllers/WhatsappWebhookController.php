<?php

namespace App\Http\Controllers;

use App\Services\MetaCredentialsResolver;
use App\Services\Whatsapp\WhatsappInboundService;
use Illuminate\Http\Request;

class WhatsappWebhookController extends Controller
{
    public function __construct(
        private readonly MetaCredentialsResolver $credentialsResolver,
        private readonly WhatsappInboundService $inboundService,
    ) {
    }

    public function verify(Request $request)
    {
        $mode = $request->query('hub_mode') ?? $request->query('hub.mode');
        $token = $request->query('hub_verify_token') ?? $request->query('hub.verify_token');
        $challenge = $request->query('hub_challenge') ?? $request->query('hub.challenge');

        $sharedToken = '';
        try {
            $sharedToken = (string) ($this->credentialsResolver->resolveShared()['verify_token'] ?? '');
        } catch (\Throwable) {
            $sharedToken = '';
        }

        $legacyToken = (string) config('services.whatsapp.webhook_verify_token', '');
        $expectedTokens = array_values(array_filter([$sharedToken, $legacyToken]));

        $tokenMatches = false;
        foreach ($expectedTokens as $expectedToken) {
            if ($expectedToken !== '' && hash_equals($expectedToken, (string) $token)) {
                $tokenMatches = true;
                break;
            }
        }

        if ($mode === 'subscribe' && $tokenMatches) {
            return response($challenge, 200)->header('Content-Type', 'text/plain');
        }

        return response()->json(['message' => 'Invalid verification token'], 403);
    }

    public function receive(Request $request)
    {
        $this->inboundService->handlePayload($request->all());

        return response()->json(['status' => 'ok'], 200);
    }
}
