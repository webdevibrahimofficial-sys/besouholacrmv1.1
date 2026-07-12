<?php

namespace App\Http\Controllers;

use App\Services\MetaHealthService;
use App\Services\MetaSystemSettingsService;
use Illuminate\Http\Request;

class SuperAdminMetaController extends Controller
{
    public function __construct(
        protected MetaHealthService $metaHealthService,
        protected MetaSystemSettingsService $metaSystemSettings
    ) {
    }

    protected function authorizeSuperAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless($user && ($user->is_super_admin ?? false), 403, 'Super Admin access required.');
    }

    public function health(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        return response()->json($this->metaHealthService->getGlobalHealth());
    }

    public function testWebhook(Request $request)
    {
        $this->authorizeSuperAdmin($request);

        $credentials = $this->metaSystemSettings->resolveSharedCredentials();
        $verifyToken = $credentials['verify_token'] ?? '';
        $webhookUrl = rtrim((string) config('app.url'), '/') . '/api/meta/webhook';

        if ($verifyToken === '') {
            return response()->json([
                'ok' => false,
                'message' => 'Verify token is not configured.',
            ], 422);
        }

        $internalRequest = Request::create('/api/meta/webhook', 'GET', [
            'hub.mode' => 'subscribe',
            'hub.verify_token' => $verifyToken,
            'hub.challenge' => 'SUPER_ADMIN_TEST',
        ]);
        $internalResponse = app()->handle($internalRequest);
        $body = trim((string) $internalResponse->getContent());
        $ok = $internalResponse->getStatusCode() === 200 && $body === 'SUPER_ADMIN_TEST';

        return response()->json([
            'ok' => $ok,
            'webhook_url' => $webhookUrl,
            'status' => $internalResponse->getStatusCode(),
            'body' => $body,
            'message' => $ok ? 'Webhook verification succeeded.' : 'Webhook verification failed.',
        ], $ok ? 200 : 422);
    }
}
