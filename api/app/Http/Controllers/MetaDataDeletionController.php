<?php

namespace App\Http\Controllers;

use App\Models\MetaAdAccount;
use App\Models\MetaBusiness;
use App\Models\MetaConnection;
use App\Models\MetaDataDeletionRequest;
use App\Models\MetaPage;
use App\Models\Integration;
use App\Services\MetaSignedRequestService;
use App\Services\MetaSystemSettingsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class MetaDataDeletionController extends Controller
{
    public function __construct(
        protected MetaSystemSettingsService $metaSystemSettings,
        protected MetaSignedRequestService $signedRequestService
    ) {
    }

    public function handle(Request $request)
    {
        $signedRequest = (string) $request->input('signed_request', '');
        if ($signedRequest === '') {
            return response()->json(['error' => 'signed_request is required'], 400);
        }

        $credentials = $this->metaSystemSettings->resolveSharedCredentials();
        $appSecret = $credentials['app_secret'] ?? null;
        if (!$appSecret) {
            return response()->json(['error' => 'Meta app secret is not configured'], 500);
        }

        $payload = $this->signedRequestService->parse($signedRequest, $appSecret);
        if (!$payload) {
            return response()->json(['error' => 'Invalid signed_request'], 400);
        }

        $fbUserId = (string) ($payload['user_id'] ?? '');
        if ($fbUserId === '') {
            return response()->json(['error' => 'Missing user_id in signed_request'], 400);
        }

        $confirmationCode = (string) Str::uuid();
        $statusUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/')
            . '/privacy/data-deletion?code=' . urlencode($confirmationCode);

        $connections = MetaConnection::withoutGlobalScopes()
            ->where('fb_user_id', $fbUserId)
            ->get();

        $connectionIds = $connections->pluck('id')->all();
        $tenantIds = $connections->pluck('tenant_id')->unique()->values()->all();

        $businessIds = MetaBusiness::withoutGlobalScopes()
            ->whereIn('connection_id', $connectionIds)
            ->pluck('id')
            ->all();

        $pagesDeleted = MetaPage::withoutGlobalScopes()
            ->whereIn('connection_id', $connectionIds)
            ->delete();

        if (!empty($businessIds)) {
            MetaAdAccount::withoutGlobalScopes()
                ->whereIn('business_id', $businessIds)
                ->delete();
        }

        MetaBusiness::withoutGlobalScopes()
            ->whereIn('connection_id', $connectionIds)
            ->delete();

        $connectionsDeleted = MetaConnection::withoutGlobalScopes()
            ->where('fb_user_id', $fbUserId)
            ->delete();

        foreach ($tenantIds as $tenantId) {
            $remaining = MetaConnection::withoutGlobalScopes()
                ->where('tenant_id', $tenantId)
                ->exists();

            if (!$remaining) {
                Integration::withoutGlobalScopes()
                    ->where('tenant_id', $tenantId)
                    ->where('provider', 'meta')
                    ->update(['status' => 'inactive']);
            }
        }

        MetaDataDeletionRequest::create([
            'fb_user_id' => $fbUserId,
            'confirmation_code' => $confirmationCode,
            'status' => 'completed',
            'connections_deleted' => $connectionsDeleted,
            'pages_deleted' => $pagesDeleted,
            'payload' => $payload,
            'completed_at' => now(),
        ]);

        Log::info('Meta data deletion callback processed', [
            'fb_user_id' => $fbUserId,
            'connections_deleted' => $connectionsDeleted,
            'pages_deleted' => $pagesDeleted,
            'confirmation_code' => $confirmationCode,
        ]);

        return response()->json([
            'url' => $statusUrl,
            'confirmation_code' => $confirmationCode,
        ]);
    }

    public function status(Request $request)
    {
        $code = trim((string) $request->query('code', ''));
        if ($code === '') {
            return response()->json(['error' => 'code is required'], 400);
        }

        $record = MetaDataDeletionRequest::where('confirmation_code', $code)->first();
        if (!$record) {
            return response()->json(['error' => 'Deletion request not found'], 404);
        }

        $maskedUserId = $record->fb_user_id;
        if (strlen($maskedUserId) > 6) {
            $maskedUserId = substr($maskedUserId, 0, 2) . str_repeat('*', strlen($maskedUserId) - 4) . substr($maskedUserId, -2);
        }

        return response()->json([
            'status' => $record->status,
            'confirmation_code' => $record->confirmation_code,
            'fb_user_id_masked' => $maskedUserId,
            'connections_deleted' => $record->connections_deleted,
            'pages_deleted' => $record->pages_deleted,
            'completed_at' => $record->completed_at,
        ]);
    }
}
