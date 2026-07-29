<?php

namespace App\Services\Whatsapp;

use App\Models\WhatsappMessageAttribution;
use App\Services\MetaAccessTokenService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class WhatsappAttributionEnrichmentService
{
    public function __construct(
        private readonly MetaAccessTokenService $accessTokenService,
    ) {
    }

    public function enrich(WhatsappMessageAttribution $attribution): WhatsappMessageAttribution
    {
        $sourceId = trim((string) ($attribution->source_id ?? ''));
        if ($sourceId === '' || ($attribution->ad_name && $attribution->campaign_name)) {
            return $attribution;
        }

        try {
            $token = $this->resolveAccessToken((int) $attribution->tenant_id);
            if (! $token) {
                return $attribution;
            }

            $response = Http::get("https://graph.facebook.com/v19.0/{$sourceId}", [
                'fields' => 'id,name,campaign{id,name}',
                'access_token' => $token,
            ]);

            if (! $response->successful()) {
                Log::info('WhatsApp attribution enrichment failed', [
                    'source_id' => $sourceId,
                    'status' => $response->status(),
                ]);

                return $attribution;
            }

            $data = $response->json();
            $attribution->forceFill([
                'ad_name' => $data['name'] ?? $attribution->ad_name,
                'campaign_name' => data_get($data, 'campaign.name') ?? $attribution->campaign_name,
                'campaign_meta_id' => data_get($data, 'campaign.id') ?? $attribution->campaign_meta_id,
            ])->save();
        } catch (\Throwable $e) {
            Log::warning('WhatsApp attribution enrichment error', [
                'message' => $e->getMessage(),
                'source_id' => $sourceId,
            ]);
        }

        return $attribution->fresh();
    }

    private function resolveAccessToken(int $tenantId): ?string
    {
        $connection = \App\Models\MetaConnection::query()
            ->where('tenant_id', $tenantId)
            ->orderByDesc('updated_at')
            ->first();

        if (! $connection) {
            return null;
        }

        try {
            return $this->accessTokenService->getTenantAccessToken($tenantId);
        } catch (\Throwable) {
            return null;
        }
    }
}
