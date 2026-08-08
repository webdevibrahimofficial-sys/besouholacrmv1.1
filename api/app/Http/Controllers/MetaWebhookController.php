<?php

namespace App\Http\Controllers;

use App\Services\MetaWebhookService;
use App\Services\MetaCredentialsResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class MetaWebhookController extends Controller
{
    protected $webhookService;
    protected $credentialsResolver;

    public function __construct(MetaWebhookService $webhookService, MetaCredentialsResolver $credentialsResolver)
    {
        $this->webhookService = $webhookService;
        $this->credentialsResolver = $credentialsResolver;
    }

    public function verify(Request $request, ?string $webhookKey = null)
    {
        try {
            $credentials = $webhookKey
                ? $this->credentialsResolver->resolveByWebhookKey($webhookKey)
                : $this->credentialsResolver->resolveShared();
        } catch (\Throwable $e) {
            Log::warning('Meta Webhook Verify failed to resolve credentials', [
                'has_webhook_key' => filled($webhookKey),
                'message' => $e->getMessage(),
            ]);

            return response()->json(['error' => 'Verification failed'], 403);
        }

        $verifyToken = $credentials['verify_token'] ?? null;

        $mode = $request->query('hub_mode')
            ?? $request->query('hub.mode')
            ?? $request->input('hub.mode')
            ?? $request->input('hub_mode');
        $token = $request->query('hub_verify_token')
            ?? $request->query('hub.verify_token')
            ?? $request->input('hub.verify_token')
            ?? $request->input('hub_verify_token');
        $challenge = $request->query('hub_challenge')
            ?? $request->query('hub.challenge')
            ?? $request->input('hub.challenge')
            ?? $request->input('hub_challenge');

        $tokenMatches = $verifyToken !== null && hash_equals((string) $verifyToken, (string) $token);
        Log::info('Meta Webhook Verify', [
            'mode' => $mode,
            'token_present' => $token !== null && $token !== '',
            'token_matches' => $tokenMatches,
            'challenge_present' => $challenge !== null && $challenge !== '',
            'source' => $credentials['source'] ?? ($webhookKey ? 'custom' : 'shared'),
        ]);

        if ($mode === 'subscribe' && $tokenMatches) {
            if ($challenge === null || $challenge === '') {
                return response()->json(['error' => 'Missing challenge'], 400);
            }
            return response((string) $challenge, 200)->header('Content-Type', 'text/plain');
        }

        return response()->json(['error' => 'Verification failed'], 403);
    }

    public function receive(Request $request, ?string $webhookKey = null)
    {
        try {
            $credentials = null;
            if ($webhookKey) {
                try {
                    $credentials = $this->credentialsResolver->resolveByWebhookKey($webhookKey);
                } catch (\Throwable $e) {
                    Log::warning('Meta Webhook Receive: invalid webhook key', [
                        'message' => $e->getMessage(),
                    ]);
                    return response()->json(['ok' => false, 'error' => 'Invalid webhook key'], 404);
                }
            }

            $payload = $request->all();
            $entryCount = is_array($payload['entry'] ?? null) ? count($payload['entry']) : 0;
            Log::info('Meta Webhook Receive', [
                'object' => $payload['object'] ?? null,
                'entry_count' => $entryCount,
                'source' => $credentials['source'] ?? 'shared',
            ]);

            $this->webhookService->handleWebhook($request, $credentials);
            return response()->json(['ok' => true], 200);
        } catch (\Symfony\Component\HttpKernel\Exception\HttpExceptionInterface $e) {
            $status = $e->getStatusCode();
            Log::error('Meta Webhook Receive Error', [
                'message' => $e->getMessage(),
                'object' => $request->input('object'),
                'has_webhook_key' => filled($webhookKey),
                'status' => $status,
            ]);

            return response()->json([
                'ok' => false,
                'error' => $status === 403 ? 'Invalid signature' : 'Webhook processing failed',
            ], $status);
        } catch (\Throwable $e) {
            Log::error('Meta Webhook Receive Error', [
                'message' => $e->getMessage(),
                'object' => $request->input('object'),
                'has_webhook_key' => filled($webhookKey),
            ]);

            return response()->json(['ok' => false, 'error' => 'Webhook processing failed'], 500);
        }
    }
}
