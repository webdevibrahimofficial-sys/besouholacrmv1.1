<?php

namespace App\Services\Whatsapp;

use App\Models\WhatsappChannel;
use App\Models\WhatsappMessage;
use App\Support\LeadPhoneMatcher;
use App\Support\PhoneNormalizer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class WhatsappChannelService
{
    public function __construct(
        private readonly WhatsappChannelConflictService $conflictService,
    ) {
    }

    public function normalizePhone(?string $phone): ?string
    {
        if ($phone === null) {
            return null;
        }

        $normalized = preg_replace('/\D+/', '', trim($phone));

        return $normalized !== '' ? $normalized : null;
    }

    public function listForTenant(int $tenantId): \Illuminate\Database\Eloquent\Collection
    {
        $channels = WhatsappChannel::query()
            ->where('tenant_id', $tenantId)
            ->orderByDesc('is_primary')
            ->orderBy('display_name')
            ->get();

        return $channels->map(function (WhatsappChannel $channel) use ($tenantId) {
            if ($channel->provider !== WhatsappChannel::PROVIDER_MIRROR) {
                return $channel;
            }

            return $this->syncMirrorChannel($tenantId, $channel);
        });
    }

    public function findByPhoneNumberId(string $phoneNumberId): ?WhatsappChannel
    {
        $phoneNumberId = trim($phoneNumberId);
        if ($phoneNumberId === '') {
            return null;
        }

        return WhatsappChannel::query()
            ->where('phone_number_id', $phoneNumberId)
            ->whereIn('status', WhatsappChannel::ACTIVE_STATUSES)
            ->first();
    }

    public function findMirrorChannel(int $tenantId): ?WhatsappChannel
    {
        return WhatsappChannel::query()
            ->where('tenant_id', $tenantId)
            ->where('provider', WhatsappChannel::PROVIDER_MIRROR)
            ->whereIn('status', WhatsappChannel::ACTIVE_STATUSES)
            ->first();
    }

    public function findPrimaryOutboundChannel(int $tenantId, ?string $provider = null): ?WhatsappChannel
    {
        $query = WhatsappChannel::query()
            ->where('tenant_id', $tenantId)
            ->where('is_primary', true)
            ->where('supports_outbound', true)
            ->whereIn('status', [WhatsappChannel::STATUS_CONNECTED, WhatsappChannel::STATUS_MIGRATING]);

        if ($provider !== null) {
            $query->where('provider', $provider);
        }

        $primary = $query->first();
        if ($primary) {
            return $primary;
        }

        $fallbackQuery = WhatsappChannel::query()
            ->where('tenant_id', $tenantId)
            ->where('supports_outbound', true)
            ->where('status', WhatsappChannel::STATUS_CONNECTED);

        if ($provider !== null) {
            $fallbackQuery->where('provider', $provider);
        }

        return $fallbackQuery->orderBy('id')->first();
    }

    /**
     * Resolve which channel should handle an outbound message.
     *
     * Order: explicit connected channel → latest message channel (by created_at)
     * that can still send → primary outbound → null (legacy settings).
     */
    public function resolveOutboundChannelId(
        int $tenantId,
        string $recipientNumber,
        ?int $explicitChannelId = null,
        ?int $leadId = null
    ): ?int {
        if ($explicitChannelId) {
            $explicit = WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $explicitChannelId)
                ->first();

            if ($explicit && $explicit->canSendOutbound()) {
                return $explicit->id;
            }
        }

        if (Schema::hasColumn('whatsapp_messages', 'channel_id')) {
            $phoneVariants = $this->buildRecipientPhoneVariants($recipientNumber);
            if ($leadId) {
                $lead = \App\Models\Lead::query()
                    ->where('tenant_id', $tenantId)
                    ->find($leadId);
                if ($lead) {
                    $phoneVariants = array_values(array_unique(array_merge(
                        $phoneVariants,
                        LeadPhoneMatcher::buildLeadPhoneVariants($lead)
                    )));
                }
            }

            $latestMessage = WhatsappMessage::query()
                ->where('tenant_id', $tenantId)
                ->whereNotNull('channel_id')
                ->where(function ($q) use ($phoneVariants, $leadId) {
                    if ($leadId && Schema::hasColumn('whatsapp_messages', 'lead_id')) {
                        $q->orWhere('lead_id', $leadId);
                    }

                    foreach ($phoneVariants as $variant) {
                        $q->orWhere('from', $variant)->orWhere('to', $variant);
                    }
                })
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->first();

            if ($latestMessage?->channel_id) {
                $fromHistory = WhatsappChannel::query()
                    ->where('tenant_id', $tenantId)
                    ->where('id', $latestMessage->channel_id)
                    ->first();

                if ($fromHistory && $fromHistory->canSendOutbound()) {
                    return $fromHistory->id;
                }
            }
        }

        return $this->findPrimaryOutboundChannel($tenantId)?->id;
    }

    /**
     * @return list<string>
     */
    private function buildRecipientPhoneVariants(string $recipientNumber): array
    {
        $digits = preg_replace('/\D+/', '', trim($recipientNumber)) ?: '';
        if ($digits === '') {
            return [];
        }

        $variants = LeadPhoneMatcher::buildPhoneVariants($digits);
        $normalized = PhoneNormalizer::normalize($digits, '20');
        if ($normalized !== '') {
            $variants = array_merge($variants, LeadPhoneMatcher::buildPhoneVariants($normalized));
        }

        return array_values(array_unique(array_filter($variants)));
    }

    public function upsertFromSettings(int $tenantId, array $attributes): WhatsappChannel
    {
        return DB::transaction(function () use ($tenantId, $attributes) {
            $provider = ($attributes['provider'] ?? WhatsappChannel::PROVIDER_META_CLOUD) === 'mirror'
                ? WhatsappChannel::PROVIDER_MIRROR
                : WhatsappChannel::PROVIDER_META_CLOUD;

            $normalizedPhone = $this->normalizePhone($attributes['phone_number'] ?? $attributes['business_number'] ?? null);
            $phoneNumberId = trim((string) ($attributes['phone_number_id'] ?? ''));

            if ($normalizedPhone) {
                $this->conflictService->assertNoActivePhoneConflict(
                    $tenantId,
                    $normalizedPhone,
                    $provider,
                    (int) ($attributes['exclude_channel_id'] ?? 0)
                );
            }

            if ($phoneNumberId !== '') {
                $this->conflictService->assertNoActivePhoneNumberIdConflict(
                    $phoneNumberId,
                    (int) ($attributes['exclude_channel_id'] ?? 0)
                );
            }

            $channel = WhatsappChannel::query()->firstOrNew([
                'tenant_id' => $tenantId,
                'provider' => $provider,
            ]);

            if (! $channel->exists && ! WhatsappChannel::query()->where('tenant_id', $tenantId)->exists()) {
                $channel->is_primary = true;
            }

            $channel->fill([
                'display_name' => $attributes['display_name'] ?? ($provider === WhatsappChannel::PROVIDER_MIRROR ? 'WhatsApp Mirror' : 'Meta Cloud API'),
                'phone_number' => $attributes['phone_number'] ?? $attributes['business_number'] ?? $channel->phone_number,
                'normalized_phone' => $normalizedPhone ?? $channel->normalized_phone,
                'phone_number_id' => $phoneNumberId !== '' ? $phoneNumberId : $channel->phone_number_id,
                'business_account_id' => $attributes['business_account_id'] ?? $channel->business_account_id,
                'access_token' => $attributes['access_token'] ?? $attributes['api_key'] ?? $channel->access_token,
                'status' => $attributes['status'] ?? WhatsappChannel::STATUS_CONNECTED,
                'supports_ctwa_attribution' => $provider === WhatsappChannel::PROVIDER_META_CLOUD,
                'last_connected_at' => ($attributes['status'] ?? null) === WhatsappChannel::STATUS_CONNECTED ? now() : $channel->last_connected_at,
            ]);

            $channel->save();

            return $channel->fresh();
        });
    }

    public function syncMirrorChannel(int $tenantId, WhatsappChannel $channel): WhatsappChannel
    {
        return DB::transaction(function () use ($tenantId, $channel) {
            $session = \App\Models\WhatsappMirrorSession::query()->where('tenant_id', $tenantId)->first();
            $phone = $session?->connected_phone_number;
            $normalizedPhone = $this->normalizePhone($phone);

            if ($normalizedPhone) {
                $this->conflictService->assertNoActivePhoneConflict(
                    $tenantId,
                    $normalizedPhone,
                    WhatsappChannel::PROVIDER_MIRROR,
                    (int) $channel->id
                );
            }

            if (($session?->reconnect_reason ?? null) === 'manual_disconnect') {
                $channel->fill([
                    'mirror_session_id' => $session?->id,
                    'phone_number' => null,
                    'normalized_phone' => null,
                    'status' => WhatsappChannel::STATUS_DISCONNECTED,
                    'is_primary' => false,
                    'supports_inbound' => false,
                    'supports_outbound' => false,
                    'last_disconnected_at' => now(),
                    'last_error' => null,
                ]);
                $channel->save();

                return $channel->fresh();
            }

            $shouldRestore = Schema::hasColumn('whatsapp_mirror_sessions', 'should_restore')
                ? (bool) ($session?->should_restore ?? false)
                : in_array($session?->status, ['connected', 'pending_qr', 'reconnecting', 'reconnect_failed'], true);

            $status = !$shouldRestore
                ? WhatsappChannel::STATUS_DISCONNECTED
                : match ($session?->status) {
                    'connected' => WhatsappChannel::STATUS_CONNECTED,
                    'pending_qr' => WhatsappChannel::STATUS_PENDING,
                    'reconnecting', 'reconnect_failed' => WhatsappChannel::STATUS_CONNECTING,
                    default => WhatsappChannel::STATUS_DISCONNECTED,
                };

            $channel->fill([
                'mirror_session_id' => $session?->id,
                'phone_number' => $phone,
                'normalized_phone' => $normalizedPhone,
                'status' => $status,
                'is_primary' => $status === WhatsappChannel::STATUS_DISCONNECTED ? false : $channel->is_primary,
                'supports_inbound' => $status !== WhatsappChannel::STATUS_DISCONNECTED,
                'supports_outbound' => $status === WhatsappChannel::STATUS_CONNECTED,
                'last_connected_at' => $status === WhatsappChannel::STATUS_CONNECTED ? now() : $channel->last_connected_at,
                'last_disconnected_at' => $status === WhatsappChannel::STATUS_DISCONNECTED ? now() : $channel->last_disconnected_at,
            ]);
            $channel->save();

            return $channel->fresh();
        });
    }

    public function markMirrorDisconnected(int $tenantId): void
    {
        DB::transaction(function () use ($tenantId) {
            WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('provider', WhatsappChannel::PROVIDER_MIRROR)
                ->update([
                    'status' => WhatsappChannel::STATUS_DISCONNECTED,
                    'last_disconnected_at' => now(),
                    'last_error' => null,
                    'supports_inbound' => false,
                    'supports_outbound' => false,
                ]);
        });
    }

    public function setPrimary(int $tenantId, int $channelId): WhatsappChannel
    {
        return DB::transaction(function () use ($tenantId, $channelId) {
            WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->lockForUpdate()
                ->get();

            $channel = WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $channelId)
                ->firstOrFail();

            if (in_array($channel->status, [WhatsappChannel::STATUS_ARCHIVED, WhatsappChannel::STATUS_ERROR], true)) {
                throw ValidationException::withMessages([
                    'channel' => ['Cannot set primary on an archived or errored channel.'],
                ]);
            }

            WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('id', '!=', $channelId)
                ->update(['is_primary' => false]);

            $channel->forceFill(['is_primary' => true])->save();

            return $channel->fresh();
        });
    }

    public function startMigration(int $tenantId, int $mirrorChannelId, int $cloudChannelId): array
    {
        return DB::transaction(function () use ($tenantId, $mirrorChannelId, $cloudChannelId) {
            $mirror = WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $mirrorChannelId)
                ->where('provider', WhatsappChannel::PROVIDER_MIRROR)
                ->firstOrFail();

            $cloud = WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $cloudChannelId)
                ->where('provider', WhatsappChannel::PROVIDER_META_CLOUD)
                ->firstOrFail();

            $mirror->update(['status' => WhatsappChannel::STATUS_MIGRATING]);
            $cloud->update(['status' => WhatsappChannel::STATUS_CONNECTING]);

            return ['mirror' => $mirror->fresh(), 'cloud' => $cloud->fresh()];
        });
    }

    public function completeMigration(int $tenantId, int $mirrorChannelId, int $cloudChannelId): array
    {
        return DB::transaction(function () use ($tenantId, $mirrorChannelId, $cloudChannelId) {
            $mirror = WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $mirrorChannelId)
                ->where('provider', WhatsappChannel::PROVIDER_MIRROR)
                ->firstOrFail();

            $cloud = WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $cloudChannelId)
                ->where('provider', WhatsappChannel::PROVIDER_META_CLOUD)
                ->firstOrFail();

            if ($cloud->status !== WhatsappChannel::STATUS_CONNECTING && $cloud->status !== WhatsappChannel::STATUS_CONNECTED) {
                throw ValidationException::withMessages([
                    'cloud' => ['Cloud channel must be connected before completing migration.'],
                ]);
            }

            $metadata = $cloud->metadata ?? [];
            if (empty($metadata['migration_test_received'])) {
                throw ValidationException::withMessages([
                    'cloud' => ['Receive a test message on the Cloud channel before completing migration.'],
                ]);
            }

            $cloud->update([
                'status' => WhatsappChannel::STATUS_CONNECTED,
                'last_connected_at' => now(),
            ]);

            $mirror->update([
                'status' => WhatsappChannel::STATUS_ARCHIVED,
                'supports_inbound' => false,
                'supports_outbound' => false,
                'is_primary' => false,
            ]);

            $this->setPrimary($tenantId, $cloud->id);

            return ['mirror' => $mirror->fresh(), 'cloud' => $cloud->fresh()];
        });
    }

    public function markMigrationTestReceived(WhatsappChannel $channel): void
    {
        $metadata = $channel->metadata ?? [];
        $metadata['migration_test_received'] = true;
        $metadata['migration_test_received_at'] = now()->toISOString();
        $metadata['migration_verification_pending'] = false;
        $channel->forceFill(['metadata' => $metadata])->save();
    }

    public function markMigrationVerificationSent(WhatsappChannel $channel, string $toPhone): void
    {
        $metadata = $channel->metadata ?? [];
        $metadata['migration_verification_pending'] = true;
        $metadata['migration_verification_sent_to'] = $toPhone;
        $metadata['migration_verification_sent_at'] = now()->toISOString();
        $metadata['migration_test_received'] = false;
        unset($metadata['migration_test_received_at']);
        $channel->forceFill(['metadata' => $metadata])->save();
    }
}
