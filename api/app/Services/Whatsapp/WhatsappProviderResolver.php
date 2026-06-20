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
        $settings = WhatsappSetting::where('tenant_id', $tenantId)->first();
        $provider = $settings?->provider ?? 'meta';

        return match ($provider) {
            'meta' => $this->metaCloudApiProvider,
            'mirror' => app(WhatsappMirrorProvider::class),
            default => throw new InvalidArgumentException("Unsupported WhatsApp provider: {$provider}"),
        };
    }
}
