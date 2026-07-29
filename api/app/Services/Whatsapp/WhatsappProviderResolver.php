<?php

namespace App\Services\Whatsapp;

use App\Contracts\WhatsappProviderInterface;
use App\Models\WhatsappSetting;
use InvalidArgumentException;

class WhatsappProviderResolver
{
    public function __construct(
        private readonly MetaCloudApiProvider $metaCloudApiProvider,
    ) {
    }

    public function resolve(int $tenantId, ?int $channelId = null): WhatsappProviderInterface
    {
        if ($channelId) {
            $channel = \App\Models\WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $channelId)
                ->first();

            if ($channel?->provider === \App\Models\WhatsappChannel::PROVIDER_MIRROR) {
                return app(WhatsappMirrorProvider::class);
            }
        }

        $provider = $this->activeProviderKey($tenantId, $channelId);

        return match ($provider) {
            'meta', 'meta_cloud' => $this->metaCloudApiProvider,
            'mirror' => app(WhatsappMirrorProvider::class),
            default => throw new InvalidArgumentException("Unsupported WhatsApp provider: {$provider}"),
        };
    }

    /**
     * Returns the normalized provider key ('meta' | 'mirror' | raw value) currently
     * active for the tenant, without instantiating the provider. Useful for
     * provider-specific business rules (e.g. Meta's 24h customer-care window
     * does not apply to the WhatsApp Mirror provider).
     */
    public function activeProviderKey(int $tenantId, ?int $channelId = null): string
    {
        if ($channelId) {
            $channel = \App\Models\WhatsappChannel::query()
                ->where('tenant_id', $tenantId)
                ->where('id', $channelId)
                ->first();

            if ($channel) {
                return $this->normalizeProvider($channel->provider === 'meta_cloud' ? 'meta' : $channel->provider);
            }
        }

        $primaryChannel = app(WhatsappChannelService::class)->findPrimaryOutboundChannel($tenantId);
        if ($primaryChannel) {
            return $this->normalizeProvider($primaryChannel->provider === 'meta_cloud' ? 'meta' : $primaryChannel->provider);
        }

        $settings = WhatsappSetting::where('tenant_id', $tenantId)->first();

        return $this->normalizeProvider($settings?->provider ?? 'meta');
    }

    /**
     * Normalize legacy/UI-label provider values (e.g. "Meta API", "WhatsApp Mirror")
     * to the canonical lowercase keys used internally. Defensive against any
     * value already persisted in whatsapp_settings.provider before this fix.
     */
    private function normalizeProvider(string $value): string
    {
        $value = strtolower(trim($value));

        return match (true) {
            in_array($value, ['meta', 'meta api', 'meta api (cloud api)', 'meta_cloud_api', 'meta-cloud-api', 'meta_cloud'], true) => 'meta',
            in_array($value, ['mirror', 'whatsapp mirror', 'whatsapp_mirror', 'whatsapp-mirror'], true) => 'mirror',
            default => $value,
        };
    }
}
