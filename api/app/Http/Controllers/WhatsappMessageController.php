<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use App\Models\WhatsappMessage;
use App\Models\Lead;
use App\Services\Whatsapp\WhatsappProviderResolver;
use App\Services\Whatsapp\MetaCloudApiProvider;
use App\Services\TenantStorageService;
use App\Support\LeadPhoneMatcher;
use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;

class WhatsappMessageController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::user();
        $messages = WhatsappMessage::where('tenant_id', $user->tenant_id)
            ->latest()->limit(50)->get();
        return response()->json($messages);
    }

    public function sendTest(Request $request, WhatsappProviderResolver $providerResolver)
    {
        $user = Auth::user();
        if ($resp = $this->ensureWhatsappAdmin($user)) {
            return $resp;
        }
        $validated = $request->validate([
            'api_key' => 'nullable|string',
            'phone_number_id' => 'nullable|string',
        ]);
        $provider = $providerResolver->resolve((int) $user->tenant_id);
        $result = $provider->testConnection((int) $user->tenant_id, $validated);

        return response()->json($result);
    }

    public function capabilitiesV1(Request $request, WhatsappProviderResolver $providerResolver)
    {
        $user = Auth::user();
        $providerKey = $providerResolver->activeProviderKey((int) $user->tenant_id);

        return response()->json([
            'provider' => $providerKey,
            'media_supported' => in_array($providerKey, ['meta', 'mirror'], true),
            'templates_supported' => $providerKey === 'meta',
        ]);
    }

    public function leadMessages(Request $request, $leadId)
    {
        $user = Auth::user();
        $lead = Lead::where('tenant_id', $user->tenant_id)->findOrFail($leadId);
        $phoneVariants = LeadPhoneMatcher::buildLeadPhoneVariants($lead);

        if (empty($phoneVariants)) {
            if (!Schema::hasColumn('whatsapp_messages', 'lead_id')) {
                return response()->json([]);
            }
        }

        $messages = WhatsappMessage::where('tenant_id', $user->tenant_id)
            ->where(function ($q) use ($phoneVariants, $lead) {
                if (Schema::hasColumn('whatsapp_messages', 'lead_id')) {
                    $q->orWhere('lead_id', $lead->id);
                }

                foreach ($phoneVariants as $variant) {
                    $q->orWhere('from', $variant)->orWhere('to', $variant);
                }
            })
            ->orderBy('created_at', 'asc')
            ->get()
            ->map(function (WhatsappMessage $m) use ($user) {
                $normalizedStatus = $this->mapStatus($m->status, $m->direction);

                if (
                    $m->direction === 'outbound'
                    && in_array($normalizedStatus, ['sent_to_baileys', 'sent_to_session'], true)
                    && $m->created_at
                    && $m->created_at->lt(now()->subSeconds(120))
                ) {
                    $normalizedStatus = 'unstable';
                }

                return [
                    'body' => $m->body,
                    'direction' => $m->direction,
                    'timestamp' => $m->created_at?->toISOString(),
                    'status' => $normalizedStatus,
                    'type' => $m->type,
                    'id' => $m->id,
                    'message_id' => $m->message_id,
                    'media' => $this->extractMediaPayload($m, (int) $user->tenant_id),
                ];
            });
        return response()->json($messages);
    }

    public function sendTemplateV1(Request $request, WhatsappProviderResolver $providerResolver)
    {
        $user = Auth::user();
        $validated = $request->validate([
            'recipient_number' => 'required|string',
            'template_name' => 'required|string',
            'variables' => 'array',
            'variables.*' => 'nullable',
            'language' => 'nullable|string',
        ]);
        $recipientNumber = $this->normalizeRecipientNumber((string) $validated['recipient_number']);
        $provider = $providerResolver->resolve((int) $user->tenant_id);
        $result = $provider->sendTemplate(
            (int) $user->tenant_id,
            $recipientNumber,
            $validated['template_name'],
            $validated['language'] ?? 'en_US',
            $validated['variables'] ?? []
        );

        return response()->json(array_merge(['ok' => (bool) ($result['ok'] ?? $result['success'] ?? true)], $result));
    }

    public function sendTextV1(Request $request, WhatsappProviderResolver $providerResolver)
    {
        $user = Auth::user();
        $validated = $request->validate([
            'recipient_number' => 'required|string',
            'message_body' => 'required|string',
        ]);
        $digits = $this->normalizeRecipientNumber((string) $validated['recipient_number']);

        $provider = $providerResolver->resolve((int) $user->tenant_id);
        $result = $provider->sendText((int) $user->tenant_id, $digits, $validated['message_body']);

        return response()->json(array_merge(['ok' => (bool) ($result['ok'] ?? $result['success'] ?? true)], $result));
    }

    public function sendMediaV1(
        Request $request,
        WhatsappProviderResolver $providerResolver,
        TenantStorageService $tenantStorageService
    ) {
        $user = Auth::user();
        $validated = $request->validate([
            'recipient_number' => 'required|string',
            'caption' => 'nullable|string|max:1024',
            'attachment' => 'required|file|max:51200',
        ]);

        $providerKey = $providerResolver->activeProviderKey((int) $user->tenant_id);
        if (!in_array($providerKey, ['meta', 'mirror'], true)) {
            throw ValidationException::withMessages([
                'attachment' => ['Media sending is currently available only with supported WhatsApp providers.'],
            ]);
        }

        $file = $request->file('attachment');
        $mediaType = $this->resolveMediaTypeFromMime((string) $file->getMimeType());
        $digits = $this->normalizeRecipientNumber((string) $validated['recipient_number']);
        $upload = $tenantStorageService->upload($file, 'whatsapp/attachments');

        $provider = $providerResolver->resolve((int) $user->tenant_id);
        $result = $provider->sendMedia(
            (int) $user->tenant_id,
            $digits,
            $mediaType,
            $upload['url'],
            $validated['caption'] ?? null,
            $file->getClientOriginalName()
        );

        $message = WhatsappMessage::query()->find($result['db_id'] ?? null);
        if ($message) {
            $raw = is_array($message->raw) ? $message->raw : [];
            $raw['request'] = array_merge($raw['request'] ?? [], [
                'attachment_path' => $upload['path'],
                'attachment_url' => $upload['url'],
                'mime_type' => $file->getMimeType(),
                'original_name' => $file->getClientOriginalName(),
                'caption' => $validated['caption'] ?? null,
            ]);
            $message->forceFill(['raw' => $raw])->save();
        }

        return response()->json(array_merge(['ok' => (bool) ($result['ok'] ?? $result['success'] ?? true)], $result));
    }

    public function streamMediaV1(
        Request $request,
        WhatsappMessage $message,
        WhatsappProviderResolver $providerResolver,
        MetaCloudApiProvider $metaCloudApiProvider
    ) {
        $user = Auth::user();
        $hasAccess = $request->hasValidSignature()
            || ($user && (int) $message->tenant_id === (int) $user->tenant_id);

        abort_unless($hasAccess, 404);

        $providerKey = $providerResolver->activeProviderKey((int) $message->tenant_id);
        if ($providerKey !== 'meta') {
            abort(404);
        }

        $raw = is_array($message->raw) ? $message->raw : [];
        $mediaId = $this->extractMetaMediaId($raw, (string) $message->type);
        if (!$mediaId) {
            abort(404);
        }

        $media = $metaCloudApiProvider->downloadMedia((int) $message->tenant_id, $mediaId);
        $filename = $media['filename'] ?: ('whatsapp-media-' . $message->id);

        return response($media['body'], 200, [
            'Content-Type' => $media['mime_type'] ?: 'application/octet-stream',
            'Content-Disposition' => 'inline; filename="' . addslashes($filename) . '"',
        ]);
    }

    private function mapStatus(?string $status, ?string $direction = null): string
    {
        if (!$status) {
            return $direction === 'outbound' ? 'sent_to_baileys' : 'received';
        }

        switch ($status) {
            case 'accepted':
            case 'sent':
            case 'sent_to_session':
            case 'sent_to_baileys':
                return $direction === 'outbound' ? 'sent_to_baileys' : 'sent';
            case 'received':
                return 'delivered';
            case 'read':
                return 'read';
            default:
                return $status;
        }
    }

    private function ensureWhatsappAdmin($user)
    {
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        $roleLower = strtolower(trim((string) ($user->role ?? $user->job_title ?? '')));
        $isTenantAdmin = $user->is_super_admin || in_array($roleLower, ['admin', 'tenant admin', 'tenant-admin', 'owner'], true);

        if ($isTenantAdmin) {
            return null;
        }

        return response()->json(['message' => 'Only tenant admins can manage WhatsApp settings.'], 403);
    }

    private function normalizeRecipientNumber(string $rawPhone): string
    {
        $digits = preg_replace('/\D+/', '', trim($rawPhone));
        if ($digits === '') {
            return '';
        }

        $normalized = PhoneNormalizer::normalize($digits, '20');
        if ($normalized !== '' && str_starts_with($normalized, '0') && strlen($normalized) > 1) {
            return '20' . substr($normalized, 1);
        }

        if (str_starts_with($digits, '0') && strlen($digits) > 1) {
            return '20' . substr($digits, 1);
        }

        return ltrim($digits, '+');
    }

    private function resolveMediaTypeFromMime(string $mimeType): string
    {
        $mimeType = strtolower(trim($mimeType));

        if (str_starts_with($mimeType, 'image/')) {
            return 'image';
        }

        if (str_starts_with($mimeType, 'video/')) {
            return 'video';
        }

        if (str_starts_with($mimeType, 'audio/')) {
            return 'audio';
        }

        return 'document';
    }

    private function extractMediaPayload(WhatsappMessage $message, int $tenantId): ?array
    {
        $raw = is_array($message->raw) ? $message->raw : [];
        $requestPayload = is_array($raw['request'] ?? null) ? $raw['request'] : [];
        $mirrorConfig = is_array($raw['mirror'] ?? null) ? $raw['mirror'] : [];
        $mirrorMessage = is_array($raw['message'] ?? null) ? $raw['message'] : [];
        $mirrorMedia = is_array($mirrorMessage['media'] ?? null) ? $mirrorMessage['media'] : [];

        $type = (string) ($message->type ?? '');
        $requestMimeType = trim((string) ($requestPayload['mime_type'] ?? ''));
        $inferredTypeFromMime = $requestMimeType !== '' ? $this->resolveMediaTypeFromMime($requestMimeType) : '';

        if (!in_array($type, ['image', 'video', 'audio', 'document', 'sticker'], true)) {
            $type = strtolower(trim((string) (
                $mirrorConfig['media_type']
                ?? $mirrorMedia['type']
                ?? $inferredTypeFromMime
            )));
        }

        if (!in_array($type, ['image', 'video', 'audio', 'document', 'sticker'], true)) {
            return null;
        }

        $typePayload = is_array($raw[$type] ?? null) ? $raw[$type] : [];

        $url = $requestPayload['attachment_path'] ?? null
            ? app(TenantStorageService::class)->getUrl($requestPayload['attachment_path'])
            : (
                $requestPayload['attachment_url']
                ?? $typePayload['link']
                ?? $typePayload['url']
                ?? $mirrorMedia['media_url']
                ?? $mirrorMessage['media_url']
                ?? $mirrorMedia['url']
                ?? $mirrorMessage['url']
                ?? null
            );

        if (!$url && $message->provider === 'meta' && $this->extractMetaMediaId($raw, $type)) {
            $url = URL::signedRoute('whatsapp.messages.media', ['message' => $message->id], now()->addMinutes(60));
        }

        if (!$url) {
            return null;
        }

        return [
            'url' => $url,
            'mime_type' => $requestPayload['mime_type'] ?? $typePayload['mime_type'] ?? $mirrorMedia['mime_type'] ?? $mirrorMessage['mime_type'] ?? null,
            'filename' => $requestPayload['original_name'] ?? $typePayload['filename'] ?? $mirrorMedia['original_name'] ?? $mirrorMedia['file_name'] ?? $mirrorMessage['file_name'] ?? null,
            'caption' => $requestPayload['caption'] ?? $typePayload['caption'] ?? $mirrorMedia['caption'] ?? $mirrorMessage['caption'] ?? $message->body,
            'type' => $type,
        ];
    }

    private function extractMetaMediaId(array $raw, string $type): ?string
    {
        $typePayload = is_array($raw[$type] ?? null) ? $raw[$type] : null;
        $mediaId = $typePayload['id'] ?? null;

        return is_string($mediaId) && $mediaId !== '' ? $mediaId : null;
    }
}
