<?php

namespace App\Jobs;

use App\Events\InboundWhatsappMessage;
use App\Models\Lead;
use App\Models\WhatsappChannel;
use App\Models\WhatsappMessage;
use App\Models\WhatsappMirrorSession;
use App\Services\Whatsapp\WhatsappChannelService;
use App\Services\Whatsapp\WhatsappGroupContactService;
use App\Services\Whatsapp\WhatsappUnassignedContactService;
use App\Support\LeadPhoneMatcher;
use App\Services\Whatsapp\WhatsappInboundNotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProcessIncomingMirrorMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tenantId;
    protected array $payload;

    public function __construct(array $payload)
    {
        $this->payload = $payload;
        $this->tenantId = (int) ($payload['tenant_id'] ?? 0);
    }

    public function handle(): void
    {
        $tenantId = $this->tenantId;
        $msgData = (array) ($this->payload['message'] ?? []);

        // Support both new 'counterpart_phone' field and legacy 'from' field
        $counterpartPhone = $msgData['counterpart_phone'] ?? $msgData['from'] ?? null;

        if (!$tenantId || empty($counterpartPhone)) {
            Log::warning('[Mirror Job Warning] Missing tenant_id or counterpart number.', [
                'tenant_id' => $tenantId,
                'payload' => $this->payload,
            ]);
            return;
        }

        $fromMe = $msgData['from_me'] ?? false;
        $direction = $fromMe ? 'outbound' : 'inbound';
        $pushName = $msgData['pushName'] ?? $msgData['push_name'] ?? null;
        $messageBody = $this->resolveIncomingBody($msgData);
        $messageType = $this->resolveMessageType($msgData);
        $isUnresolvedLid = (bool) ($msgData['is_unresolved_lid'] ?? false);
        $rawIdentifiers = [
            'message_id' => $msgData['message_id'] ?? null,
            'sender_pn' => $msgData['sender_pn'] ?? null,
            'participant_pn' => $msgData['participant_pn'] ?? null,
            'participant' => $msgData['participant'] ?? null,
            'remote_jid' => $msgData['remote_jid'] ?? null,
            'sender' => $msgData['sender'] ?? null,
            'author' => $msgData['author'] ?? null,
            'phone' => $counterpartPhone,
        ];
        $counterpartLid = $this->extractCounterpartLid($rawIdentifiers);

        $session = WhatsappMirrorSession::where('tenant_id', $tenantId)->first();
        $ownNumber = $session?->connected_phone_number;
        $mirrorChannel = app(WhatsappChannelService::class)->findMirrorChannel($tenantId);
        if (! $mirrorChannel && $session?->status === 'connected') {
            $mirrorChannel = WhatsappChannel::query()->firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'provider' => WhatsappChannel::PROVIDER_MIRROR,
                ],
                [
                    'display_name' => 'WhatsApp Mirror',
                    'status' => WhatsappChannel::STATUS_CONNECTED,
                    'supports_ctwa_attribution' => false,
                ]
            );
            $mirrorChannel = app(WhatsappChannelService::class)->syncMirrorChannel($tenantId, $mirrorChannel);
        }

        $from = $direction === 'inbound' ? $counterpartPhone : $ownNumber;
        $to = $direction === 'outbound' ? $counterpartPhone : $ownNumber;

        $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $counterpartPhone);
        $resolvedLeadId = $lead?->id;

        try {
            $enrichedPayload = $this->payload;
            $storedMedia = $this->persistIncomingMedia($tenantId, $msgData);
            if ($storedMedia) {
                $enrichedPayload['message']['media'] = array_merge(
                    is_array($enrichedPayload['message']['media'] ?? null) ? $enrichedPayload['message']['media'] : [],
                    $storedMedia
                );
                $enrichedPayload['request'] = array_merge(
                    is_array($enrichedPayload['request'] ?? null) ? $enrichedPayload['request'] : [],
                    [
                        'attachment_path' => $storedMedia['attachment_path'],
                        'mime_type' => $storedMedia['mime_type'] ?? null,
                        'original_name' => $storedMedia['original_name'] ?? null,
                        'caption' => $storedMedia['caption'] ?? null,
                    ]
                );
            }

            $attributes = [
                'tenant_id' => $tenantId,
                'channel_id' => $mirrorChannel?->id,
                'provider' => 'mirror',
                'direction' => $direction,
                'from' => $from,
                'to' => $to,
                'type' => $messageType,
                'status' => $direction === 'outbound' ? 'sent_to_session' : 'received',
                'message_id' => $msgData['message_id'] ?? null,
                'body' => $messageBody,
                'raw' => $enrichedPayload,
            ];

            if (Schema::hasColumn('whatsapp_messages', 'source')) {
                $attributes['source'] = 'live';
            }

            if (Schema::hasColumn('whatsapp_messages', 'lead_id')) {
                $attributes['lead_id'] = $resolvedLeadId;
            }

            if (Schema::hasColumn('whatsapp_messages', 'counterpart_lid')) {
                $attributes['counterpart_lid'] = $counterpartLid;
            }

            $message = WhatsappMessage::firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'message_id' => $msgData['message_id'] ?? null,
                ],
                $attributes
            );

            $updates = [];
            if (
                ($attributes['type'] ?? 'text') === 'text'
                && in_array((string) ($message->type ?? ''), ['image', 'video', 'audio', 'document', 'sticker'], true)
            ) {
                $attributes['type'] = $message->type;
            }

            // Never clobber a non-empty CRM/history body with an empty mirror echo.
            foreach (['from', 'to', 'direction', 'status', 'type'] as $field) {
                if (($message->{$field} ?? null) === ($attributes[$field] ?? null)) {
                    continue;
                }

                // Do not move a CRM-sent outbound message onto a different
                // phone just because the WhatsApp echo resolved a LID wrongly.
                if (in_array($field, ['from', 'to'], true)
                    && $this->shouldKeepExistingPhone((string) ($message->{$field} ?? ''), (string) ($attributes[$field] ?? ''))
                ) {
                    continue;
                }

                $updates[$field] = $attributes[$field] ?? null;
            }

            $incomingBody = trim((string) ($attributes['body'] ?? ''));
            $existingBody = trim((string) ($message->body ?? ''));
            if ($incomingBody !== '' && $incomingBody !== $existingBody) {
                $updates['body'] = $attributes['body'];
            }

            if (
                $resolvedLeadId
                && Schema::hasColumn('whatsapp_messages', 'lead_id')
                && (int) ($message->lead_id ?? 0) !== (int) $resolvedLeadId
            ) {
                $updates['lead_id'] = $resolvedLeadId;
            }

            if (!empty($updates)) {
                $message->forceFill($updates)->save();
                $message->refresh();
            }

            $unassignedContactService = app(WhatsappUnassignedContactService::class);
            app(WhatsappGroupContactService::class)->autoResolveFromMessageEvent(
                $tenantId,
                $rawIdentifiers,
                (string) $counterpartPhone,
                $message->created_at
            );

            if (!$resolvedLeadId) {
                // Always upsert the unassigned contact so that contacts whose
                // first message arrived before the service was running (and thus
                // already have a whatsapp_messages row) still get registered.
                $unassignedContactService->recordPendingMessage(
                    $tenantId,
                    (string) $counterpartPhone,
                    is_string($pushName) ? $pushName : null,
                    is_string($messageBody) ? $messageBody : null,
                    $message->created_at,
                    $message->wasRecentlyCreated, // only increment count for new messages
                    $isUnresolvedLid
                );
            } elseif ($resolvedLeadId) {
                $unassignedContactService->markAsConverted(
                    $tenantId,
                    (string) $counterpartPhone,
                    (int) $resolvedLeadId,
                    is_string($pushName) ? $pushName : null,
                    is_string($messageBody) ? $messageBody : null,
                    $message->created_at,
                    false
                );
            }

            if ($message->wasRecentlyCreated && $resolvedLeadId) {
                $leadModel = $lead instanceof Lead
                    ? $lead
                    : Lead::query()->where('tenant_id', $tenantId)->find($resolvedLeadId);

                if ($leadModel) {
                    app(WhatsappInboundNotificationService::class)
                        ->notifyAssignedSales($leadModel, $message);
                }
            }

            if ($message->wasRecentlyCreated) {
                event(new InboundWhatsappMessage($tenantId, [
                    'id' => $message->id,
                    'lead_id' => $message->lead_id,
                    'message_id' => $message->message_id,
                    'body' => $message->body,
                    'from' => $message->from,
                    'to' => $message->to,
                    'direction' => $message->direction,
                    'status' => $message->status,
                    'type' => $message->type,
                    'timestamp' => $message->created_at?->toISOString(),
                ]));
            }
        } catch (\Exception $e) {
            Log::error("[Mirror Job Error] Tenant {$tenantId}: " . $e->getMessage());
        }
    }

    private function shouldKeepExistingPhone(string $existing, string $incoming): bool
    {
        $existingDigits = preg_replace('/\D+/', '', $existing) ?: '';
        $incomingDigits = preg_replace('/\D+/', '', $incoming) ?: '';

        if ($existingDigits === '' || strlen($existingDigits) < 7) {
            return false;
        }

        $existingIsLid = strlen($existingDigits) >= 14 || str_contains(strtolower($existing), '@lid');
        $incomingIsLid = $incomingDigits === ''
            || strlen($incomingDigits) >= 14
            || str_contains(strtolower($incoming), '@lid');

        if ($existingIsLid) {
            return false;
        }

        if ($incomingIsLid) {
            return true;
        }

        if ($existingDigits === $incomingDigits) {
            return false;
        }

        return !str_ends_with($existingDigits, $incomingDigits)
            && !str_ends_with($incomingDigits, $existingDigits);
    }

    private function extractCounterpartLid(array $identifiers): ?string
    {
        foreach (['participant', 'remote_jid', 'sender', 'author', 'phone'] as $key) {
            $lid = $this->extractLid($identifiers[$key] ?? null);
            if ($lid) {
                return $lid;
            }
        }

        return null;
    }

    private function extractLid(mixed $value): ?string
    {
        if (!is_scalar($value)) {
            return null;
        }

        $raw = trim((string) $value);
        if ($raw === '' || (!str_contains(strtolower($raw), '@lid') && !preg_match('/^\d{14,}$/', $raw))) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', explode('@', $raw)[0] ?? '') ?: '';
        return $digits !== '' ? $digits : null;
    }

    private function resolveMessageType(array $msgData): string
    {
        $type = strtolower(trim((string) ($msgData['type'] ?? '')));
        if (in_array($type, ['image', 'video', 'audio', 'document', 'sticker', 'text'], true)) {
            return $type;
        }

        $mediaType = strtolower(trim((string) data_get($msgData, 'media.type', '')));
        if (in_array($mediaType, ['image', 'video', 'audio', 'document', 'sticker'], true)) {
            return $mediaType;
        }

        return 'text';
    }

    private function resolveIncomingBody(array $msgData): string
    {
        $candidates = [
            $msgData['body'] ?? null,
            $msgData['caption'] ?? null,
            data_get($msgData, 'media.caption'),
            data_get($msgData, 'text.body'),
            data_get($msgData, 'conversation'),
            data_get($msgData, 'extendedTextMessage.text'),
        ];

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && trim($candidate) !== '') {
                return trim($candidate);
            }
        }

        return '';
    }

    private function persistIncomingMedia(int $tenantId, array $msgData): ?array
    {
        $media = is_array($msgData['media'] ?? null) ? $msgData['media'] : null;
        $base64 = is_string($media['base64'] ?? null) ? $media['base64'] : null;

        if (!$media || !$base64) {
            return null;
        }

        $mediaType = strtolower(trim((string) ($media['type'] ?? 'document')));
        $extension = $this->resolveExtensionFromMime(
            (string) ($media['mime_type'] ?? ''),
            $mediaType
        );
        $originalName = trim((string) ($media['file_name'] ?? '')) ?: "whatsapp-{$mediaType}.{$extension}";
        $safeFileName = Str::uuid()->toString() . '.' . $extension;
        $path = "{$tenantId}/whatsapp/incoming/{$safeFileName}";
        $binary = base64_decode($base64, true);

        if ($binary === false || $binary === '') {
            return null;
        }

        Storage::disk('tenants')->put($path, $binary);

        return [
            'attachment_path' => $path,
            'media_url' => app(\App\Services\TenantStorageService::class)->getUrl($path),
            'mime_type' => $media['mime_type'] ?? null,
            'original_name' => $originalName,
            'caption' => $media['caption'] ?? null,
            'type' => $mediaType,
        ];
    }

    private function resolveExtensionFromMime(string $mimeType, string $mediaType = 'document'): string
    {
        $mimeType = strtolower(trim($mimeType));

        return match (true) {
            str_contains($mimeType, 'jpeg'), str_contains($mimeType, 'jpg') => 'jpg',
            str_contains($mimeType, 'png') => 'png',
            str_contains($mimeType, 'gif') => 'gif',
            str_contains($mimeType, 'webp') => 'webp',
            str_contains($mimeType, 'mp4') => 'mp4',
            str_contains($mimeType, 'mpeg') => 'mp3',
            str_contains($mimeType, 'ogg') => 'ogg',
            str_contains($mimeType, 'pdf') => 'pdf',
            $mediaType === 'image' => 'jpg',
            $mediaType === 'video' => 'mp4',
            $mediaType === 'audio' => 'mp3',
            default => 'bin',
        };
    }
}
