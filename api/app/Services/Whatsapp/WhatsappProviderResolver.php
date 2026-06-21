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

    public function resolve(int $tenantId): WhatsappProviderInterface
    {
        $provider = $this->activeProviderKey($tenantId);

        return match ($provider) {
            'meta' => $this->metaCloudApiProvider,
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
    public function activeProviderKey(int $tenantId): string
    {
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
            in_array($value, ['meta', 'meta api', 'meta api (cloud api)', 'meta_cloud_api', 'meta-cloud-api'], true) => 'meta',
            in_array($value, ['mirror', 'whatsapp mirror', 'whatsapp_mirror', 'whatsapp-mirror'], true) => 'mirror',
            default => $value,
        };
    }
}
