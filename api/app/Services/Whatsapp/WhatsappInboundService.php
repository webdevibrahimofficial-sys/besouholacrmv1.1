<?php

namespace App\Services\Whatsapp;

use App\Events\InboundWhatsappMessage;
use App\Models\Campaign;
use App\Models\Lead;
use App\Models\Source;
use App\Models\WhatsappChannel;
use App\Models\WhatsappMessage;
use App\Models\WhatsappMessageAttribution;
use App\Models\WhatsappSetting;
use App\Models\WhatsappUnassignedContact;
use App\Support\LeadPhoneMatcher;
use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class WhatsappInboundService
{
    public function __construct(
        private readonly WhatsappChannelService $channelService,
        private readonly WhatsappUnassignedContactService $unassignedContactService,
        private readonly WhatsappAttributionEnrichmentService $attributionEnrichmentService,
    ) {
    }

    public function handlePayload(array $payload): void
    {
        $phoneId = $this->extractPhoneNumberId($payload);
        if (! $phoneId) {
            Log::warning('WhatsApp webhook: missing phone_number_id');

            return;
        }

        $channel = $this->channelService->findByPhoneNumberId($phoneId);
        if (! $channel) {
            $legacySetting = WhatsappSetting::where('phone_number_id', $phoneId)->first();
            if ($legacySetting) {
                $channel = $this->channelService->upsertFromSettings((int) $legacySetting->tenant_id, [
                    'provider' => 'meta_cloud',
                    'phone_number_id' => $phoneId,
                    'business_number' => $legacySetting->business_number,
                    'business_account_id' => $legacySetting->business_account_id,
                    'api_key' => $legacySetting->api_key,
                    'status' => WhatsappChannel::STATUS_CONNECTED,
                ]);
            }
        }

        if (! $channel) {
            Log::warning('WhatsApp webhook: phone_number_id not mapped', ['phone_number_id' => $phoneId]);

            return;
        }

        $entry = $payload['entry'][0] ?? [];
        $changes = $entry['changes'][0] ?? [];
        $value = $changes['value'] ?? [];
        $messages = $value['messages'] ?? [];

        Log::info('WhatsApp webhook received', [
            'tenant_id' => $channel->tenant_id,
            'channel_id' => $channel->id,
            'phone_number_id' => $phoneId,
            'messages_count' => count($messages),
        ]);

        foreach ($messages as $message) {
            $this->storeInboundMessage($channel, $phoneId, $message);
        }
    }

    private function storeInboundMessage(WhatsappChannel $channel, string $phoneId, array $message): void
    {
        $tenantId = (int) $channel->tenant_id;
        $messageId = $message['id'] ?? null;
        $from = (string) ($message['from'] ?? '');
        $body = $this->resolveInboundBody($message);
        $referral = is_array($message['referral'] ?? null) ? $message['referral'] : null;
        $contactName = data_get($message, 'contacts.0.profile.name')
            ?? data_get($message, 'profile.name');

        $attributes = [
            'tenant_id' => $tenantId,
            'channel_id' => $channel->id,
            'provider' => 'meta',
            'phone_number_id' => $phoneId,
            'from' => $from !== '' ? $from : null,
            'to' => $message['to'] ?? null,
            'type' => $message['type'] ?? null,
            'status' => 'received',
            'direction' => 'inbound',
            'message_id' => $messageId,
            'body' => $body,
            'raw' => $message,
        ];

        $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $from);
        if ($lead && Schema::hasColumn('whatsapp_messages', 'lead_id')) {
            $attributes['lead_id'] = $lead->id;
        }

        $saved = $messageId
            ? WhatsappMessage::firstOrCreate(
                ['tenant_id' => $tenantId, 'message_id' => $messageId],
                $attributes
            )
            : WhatsappMessage::create($attributes);

        if ((int) ($saved->channel_id ?? 0) !== (int) $channel->id) {
            $saved->forceFill(['channel_id' => $channel->id])->save();
            $saved->refresh();
        }

        if (
            $lead
            && Schema::hasColumn('whatsapp_messages', 'lead_id')
            && (int) ($saved->lead_id ?? 0) !== (int) $lead->id
        ) {
            $saved->forceFill(['lead_id' => $lead->id])->save();
            $saved->refresh();
        }

        if ($referral && $channel->supports_ctwa_attribution) {
            $this->storeAttribution($channel, $saved, $lead, $referral);

            if (! $lead) {
                $lead = $this->maybeAutoCreateCtwaLead(
                    $channel,
                    $from,
                    is_string($contactName) ? $contactName : null,
                    $referral,
                    $body,
                    $saved
                );
            }
        }

        if (
            $channel->status === WhatsappChannel::STATUS_CONNECTING
            || $channel->status === WhatsappChannel::STATUS_MIGRATING
            || ! empty(($channel->metadata ?? [])['migration_verification_pending'])
        ) {
            $this->channelService->markMigrationTestReceived($channel);
        }

        if (! $lead) {
            $this->unassignedContactService->recordPendingMessage(
                $tenantId,
                $from,
                is_string($contactName) ? $contactName : null,
                $body,
                $saved->created_at,
                $saved->wasRecentlyCreated,
                false
            );
        } else {
            if (
                Schema::hasColumn('whatsapp_messages', 'lead_id')
                && (int) ($saved->lead_id ?? 0) !== (int) $lead->id
            ) {
                $saved->forceFill(['lead_id' => $lead->id])->save();
                $saved->refresh();
            }

            $this->unassignedContactService->markAsConverted(
                $tenantId,
                $from,
                (int) $lead->id,
                is_string($contactName) ? $contactName : null,
                $body,
                $saved->created_at,
                false
            );
        }

        if (($messageId === null || $saved->wasRecentlyCreated) && $lead instanceof Lead) {
            app(WhatsappInboundNotificationService::class)
                ->notifyAssignedSales($lead, $saved);
        }

        if (! $messageId || $saved->wasRecentlyCreated) {
            try {
                event(new InboundWhatsappMessage($tenantId, [
                    'id' => $saved->id,
                    'channel_id' => $saved->channel_id,
                    'lead_id' => $saved->lead_id ?? null,
                    'message_id' => $saved->message_id,
                    'body' => $saved->body,
                    'from' => $saved->from,
                    'to' => $saved->to,
                    'direction' => $saved->direction,
                    'status' => $saved->status,
                    'type' => $saved->type,
                    'timestamp' => $saved->created_at?->toISOString(),
                ]));
            } catch (\Throwable $e) {
                Log::warning('Failed to broadcast inbound WhatsApp message', ['error' => $e->getMessage()]);
            }
        }
    }

    private function maybeAutoCreateCtwaLead(
        WhatsappChannel $channel,
        string $from,
        ?string $contactName,
        array $referral,
        ?string $body,
        WhatsappMessage $message
    ): ?Lead {
        $tenantId = (int) $channel->tenant_id;
        $settings = WhatsappSetting::query()->where('tenant_id', $tenantId)->first();
        if (! $settings?->auto_create_ctwa_leads) {
            return null;
        }

        return DB::transaction(function () use ($tenantId, $from, $contactName, $referral, $body, $message) {
            $existingLead = LeadPhoneMatcher::findLeadByPhone($tenantId, $from);
            if ($existingLead) {
                $this->attachAttributionLead($message, $existingLead);

                return $existingLead;
            }

            $phoneVariants = LeadPhoneMatcher::buildPhoneVariants($from);
            $convertedContact = WhatsappUnassignedContact::query()
                ->where('tenant_id', $tenantId)
                ->where('status', 'converted')
                ->whereNotNull('converted_lead_id')
                ->where(function ($q) use ($phoneVariants, $from) {
                    $q->where('phone', $from);
                    foreach ($phoneVariants as $variant) {
                        $q->orWhere('phone', $variant);
                    }
                })
                ->lockForUpdate()
                ->first();

            if ($convertedContact?->converted_lead_id) {
                $convertedLead = Lead::query()
                    ->where('tenant_id', $tenantId)
                    ->find($convertedContact->converted_lead_id);
                if ($convertedLead) {
                    $this->attachAttributionLead($message, $convertedLead);

                    return $convertedLead;
                }
            }

            // Re-check lead under lock race with another inbound create
            $existingLead = LeadPhoneMatcher::findLeadByPhone($tenantId, $from);
            if ($existingLead) {
                $this->attachAttributionLead($message, $existingLead);

                return $existingLead;
            }

            $normalizedPhone = PhoneNormalizer::normalize($from, '20');
            if ($normalizedPhone === '') {
                $normalizedPhone = preg_replace('/\D+/', '', $from) ?: $from;
            }

            $sourceName = Source::withoutGlobalScopes()->firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'name' => 'WhatsApp CTWA',
                ],
                [
                    'is_active' => true,
                ]
            )->name;

            $inventory = $this->resolveInventoryFromCtwaReferral($tenantId, $referral, $message);

            $lead = Lead::create(array_merge([
                'tenant_id' => $tenantId,
                'name' => trim((string) ($contactName ?: '')) !== ''
                    ? trim((string) $contactName)
                    : ('WhatsApp ' . $normalizedPhone),
                'phone' => $normalizedPhone,
                'source' => $sourceName,
                'stage' => 'New Lead',
                'status' => 'new',
                'priority' => 'medium',
                'campaign' => $referral['headline'] ?? null,
                'notes' => $body,
                'meta_data' => [
                    'ctwa' => array_filter([
                        'source_id' => $referral['source_id'] ?? null,
                        'headline' => $referral['headline'] ?? null,
                        'source_type' => $referral['source_type'] ?? null,
                        'ctwa_clid' => $referral['ctwa_clid'] ?? null,
                        'source_url' => $referral['source_url'] ?? null,
                    ]),
                ],
            ], $inventory));

            $this->unassignedContactService->attachLeadToMatchingMessages($tenantId, $lead);
            $this->unassignedContactService->markAsConverted(
                $tenantId,
                $from,
                (int) $lead->id,
                $contactName,
                $body,
                $message->created_at,
                true
            );
            $this->attachAttributionLead($message, $lead);

            return $lead;
        });
    }

    /**
     * @return array{project_id?: int, item_id?: int, campaign_id?: int}
     */
    private function resolveInventoryFromCtwaReferral(int $tenantId, array $referral, WhatsappMessage $message): array
    {
        $attribution = WhatsappMessageAttribution::query()
            ->where('whatsapp_message_id', $message->id)
            ->first();

        $campaignMetaId = trim((string) ($attribution?->campaign_meta_id ?? ''));
        $campaignName = trim((string) ($attribution?->campaign_name ?? ($referral['headline'] ?? '')));

        $campaign = null;
        if ($campaignMetaId !== '') {
            $campaign = Campaign::query()
                ->where('tenant_id', $tenantId)
                ->where('meta_id', $campaignMetaId)
                ->first();
        }

        if (! $campaign && $campaignName !== '') {
            $campaign = Campaign::query()
                ->where('tenant_id', $tenantId)
                ->where('provider', 'meta')
                ->where('name', $campaignName)
                ->first();
        }

        if (! $campaign) {
            return [];
        }

        return array_filter([
            'campaign_id' => $campaign->id,
            'project_id' => $campaign->project_id,
            'item_id' => $campaign->item_id,
        ]);
    }

    private function attachAttributionLead(WhatsappMessage $message, Lead $lead): void
    {
        if (Schema::hasColumn('whatsapp_messages', 'lead_id') && (int) ($message->lead_id ?? 0) !== (int) $lead->id) {
            $message->forceFill(['lead_id' => $lead->id])->save();
        }

        WhatsappMessageAttribution::query()
            ->where('whatsapp_message_id', $message->id)
            ->where(function ($q) use ($lead) {
                $q->whereNull('lead_id')->orWhere('lead_id', '!=', $lead->id);
            })
            ->update(['lead_id' => $lead->id]);
    }

    private function storeAttribution(
        WhatsappChannel $channel,
        WhatsappMessage $message,
        ?Lead $lead,
        array $referral
    ): void {
        $attribution = WhatsappMessageAttribution::firstOrCreate(
            ['whatsapp_message_id' => $message->id],
            [
                'tenant_id' => $channel->tenant_id,
                'channel_id' => $channel->id,
                'lead_id' => $lead?->id,
                'ctwa_clid' => $referral['ctwa_clid'] ?? null,
                'source_id' => $referral['source_id'] ?? null,
                'source_type' => $referral['source_type'] ?? null,
                'source_url' => $referral['source_url'] ?? null,
                'headline' => $referral['headline'] ?? null,
                'referral_raw' => $referral,
            ]
        );

        $this->attributionEnrichmentService->enrich($attribution);
    }

    private function extractPhoneNumberId(array $payload): ?string
    {
        $entry = $payload['entry'][0] ?? null;
        $changes = $entry['changes'][0] ?? null;
        $value = $changes['value'] ?? null;
        $meta = $value['metadata'] ?? null;
        $id = $meta['phone_number_id'] ?? null;

        return $id ? (string) $id : null;
    }

    private function resolveInboundBody(array $message): ?string
    {
        return data_get($message, 'text.body')
            ?? data_get($message, 'button.text')
            ?? data_get($message, 'image.caption')
            ?? data_get($message, 'video.caption')
            ?? data_get($message, 'document.caption')
            ?? data_get($message, 'document.filename');
    }
}
