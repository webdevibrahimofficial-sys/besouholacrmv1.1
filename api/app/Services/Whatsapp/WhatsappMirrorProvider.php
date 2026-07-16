<?php

namespace App\Services\Whatsapp;

use App\Contracts\WhatsappProviderInterface;
use App\Events\InboundWhatsappMessage;
use App\Models\WhatsappMessage;
use App\Support\LeadPhoneMatcher;
use Exception;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Log;

class WhatsappMirrorProvider implements WhatsappProviderInterface
{
    protected WhatsappMirrorClient $client;

    public function __construct(WhatsappMirrorClient $client)
    {
        $this->client = $client;
    }

    public function sendText(int $tenantId, string $to, string $body, ?int $channelId = null): array
    {
        $response = $this->client->send($tenantId, $to, $body);

        if (!$response->successful()) {
            throw new Exception("WhatsApp Mirror failed to send message: " . $response->body());
        }

        $data = $response->json();

        $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $to);
        $resolvedChannelId = $this->resolveChannelId($tenantId, $channelId);
        $messageId = $data['messageId'] ?? null;

        if (!$messageId) {
            Log::warning('[WhatsApp Mirror] Missing messageId in send response.', [
                'tenant_id' => $tenantId,
                'to' => $to,
                'response' => $data,
            ]);

            $message = WhatsappMessage::create($this->buildMessageAttributes(
                [
                'tenant_id' => $tenantId,
                'channel_id' => $resolvedChannelId,
                'provider' => 'mirror',
                'direction' => 'outbound',
                'to' => $to,
                'body' => $body,
                'message_id' => null,
                'status' => 'sent_to_session',
                ],
                'crm_send',
                $lead?->id
            ));
        } else {
            try {
                $message = WhatsappMessage::firstOrCreate(
                    [
                        'tenant_id' => $tenantId,
                        'message_id' => $messageId,
                    ],
                    $this->buildMessageAttributes([
                        'tenant_id' => $tenantId,
                        'channel_id' => $resolvedChannelId,
                        'provider' => 'mirror',
                        'direction' => 'outbound',
                        'to' => $to,
                        'body' => $body,
                        'message_id' => $messageId,
                        'status' => 'sent_to_session',
                    ], 'crm_send', $lead?->id)
                );
            } catch (QueryException $e) {
                $driverErrorCode = (int) ($e->errorInfo[1] ?? 0);

                if ($driverErrorCode !== 1062) {
                    throw $e;
                }

                $message = WhatsappMessage::where('tenant_id', $tenantId)
                    ->where('message_id', $messageId)
                    ->firstOrFail();
            }
        }

        if (
            $lead?->id
            && Schema::hasColumn('whatsapp_messages', 'lead_id')
            && (int) ($message->lead_id ?? 0) !== (int) $lead->id
        ) {
            $message->forceFill(['lead_id' => $lead->id])->save();
            $message->refresh();
        }

        if (
            $resolvedChannelId
            && Schema::hasColumn('whatsapp_messages', 'channel_id')
            && (int) ($message->channel_id ?? 0) !== (int) $resolvedChannelId
        ) {
            $message->forceFill(['channel_id' => $resolvedChannelId])->save();
            $message->refresh();
        }

        event(new InboundWhatsappMessage($tenantId, [
            'id' => $message->id,
            'lead_id' => $message->lead_id,
            'message_id' => $message->message_id,
            'body' => $message->body,
            'from' => $message->from,
            'to' => $message->to,
            'direction' => $message->direction,
            'status' => $message->status,
            'type' => $message->type ?? 'text',
            'timestamp' => $message->created_at?->toISOString(),
        ]));

        return [
            'success' => true,
            'message_id' => $message->message_id,
            'db_id' => $message->id,
            'channel_id' => $resolvedChannelId,
        ];
    }

    public function sendTemplate(int $tenantId, string $to, string $templateName, string $languageCode = 'en_US', array $components = [], ?int $channelId = null): array
    {
        throw new Exception("Templates are not supported on WhatsApp Mirror provider.");
    }

    public function sendMedia(
        int $tenantId,
        string $to,
        string $mediaType,
        string $mediaUrl,
        ?string $caption = null,
        ?string $filename = null,
        ?int $channelId = null
    ): array {
        $response = $this->client->sendMedia($tenantId, $to, $mediaType, $mediaUrl, $caption, $filename);

        if (!$response->successful()) {
            throw new Exception("WhatsApp Mirror failed to send media: " . $response->body());
        }

        $data = $response->json();
        $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $to);
        $resolvedChannelId = $this->resolveChannelId($tenantId, $channelId);
        $messageId = $data['messageId'] ?? null;

        $defaults = $this->buildMessageAttributes([
            'tenant_id' => $tenantId,
            'channel_id' => $resolvedChannelId,
            'provider' => 'mirror',
            'direction' => 'outbound',
            'to' => $to,
            'body' => $caption,
            'type' => $mediaType,
            'message_id' => $messageId,
            'status' => 'sent_to_session',
            'raw' => [
                'response' => $data,
                'mirror' => [
                    'media_type' => $mediaType,
                    'media_url' => $mediaUrl,
                    'filename' => $filename,
                    'caption' => $caption,
                ],
            ],
        ], 'crm_send', $lead?->id);

        if (!$messageId) {
            Log::warning('[WhatsApp Mirror] Missing messageId in media send response.', [
                'tenant_id' => $tenantId,
                'to' => $to,
                'media_type' => $mediaType,
                'response' => $data,
            ]);

            $message = WhatsappMessage::create($defaults);
        } else {
            try {
                $message = WhatsappMessage::firstOrCreate(
                    [
                        'tenant_id' => $tenantId,
                        'message_id' => $messageId,
                    ],
                    $defaults
                );
            } catch (QueryException $e) {
                $driverErrorCode = (int) ($e->errorInfo[1] ?? 0);

                if ($driverErrorCode !== 1062) {
                    throw $e;
                }

                $message = WhatsappMessage::where('tenant_id', $tenantId)
                    ->where('message_id', $messageId)
                    ->firstOrFail();
            }
        }

        if (
            $lead?->id
            && Schema::hasColumn('whatsapp_messages', 'lead_id')
            && (int) ($message->lead_id ?? 0) !== (int) $lead->id
        ) {
            $message->forceFill(['lead_id' => $lead->id])->save();
            $message->refresh();
        }

        if (
            $resolvedChannelId
            && Schema::hasColumn('whatsapp_messages', 'channel_id')
            && (int) ($message->channel_id ?? 0) !== (int) $resolvedChannelId
        ) {
            $message->forceFill(['channel_id' => $resolvedChannelId])->save();
            $message->refresh();
        }

        event(new InboundWhatsappMessage($tenantId, [
            'id' => $message->id,
            'lead_id' => $message->lead_id,
            'message_id' => $message->message_id,
            'body' => $message->body,
            'from' => $message->from,
            'to' => $message->to,
            'direction' => $message->direction,
            'status' => $message->status,
            'type' => $message->type ?? $mediaType,
            'timestamp' => $message->created_at?->toISOString(),
        ]));

        return [
            'success' => true,
            'message_id' => $message->message_id,
            'db_id' => $message->id,
            'channel_id' => $resolvedChannelId,
        ];
    }

    public function testConnection(int $tenantId, array $credentials = []): array
    {
        $response = $this->client->status($tenantId);
        $status = $response->json()['status'] ?? 'disconnected';

        return [
            'success' => $status === 'connected',
            'status' => $status
        ];
    }

    protected function resolveChannelId(int $tenantId, ?int $channelId): ?int
    {
        if ($channelId) {
            return $channelId;
        }

        if (! Schema::hasColumn('whatsapp_messages', 'channel_id')) {
            return null;
        }

        return app(WhatsappChannelService::class)->findMirrorChannel($tenantId)?->id;
    }

    protected function buildMessageAttributes(array $attributes, string $source, ?int $leadId): array
    {
        if (Schema::hasColumn('whatsapp_messages', 'source')) {
            $attributes['source'] = $source;
        }

        if (Schema::hasColumn('whatsapp_messages', 'lead_id')) {
            $attributes['lead_id'] = $leadId;
        }

        if (! Schema::hasColumn('whatsapp_messages', 'channel_id')) {
            unset($attributes['channel_id']);
        }

        return $attributes;
    }
}
