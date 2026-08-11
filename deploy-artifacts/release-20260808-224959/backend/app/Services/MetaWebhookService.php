<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class MetaWebhookService
{
    public function __construct(protected MetaCredentialsResolver $credentialsResolver)
    {
    }

    public function handleWebhook(Request $request, ?array $credentials = null): void
    {
        $allowPostmanBypass = !app()->environment('production')
            && $request->header('X-Webhook-Test') === 'postman';

        $resolvedCredentials = $credentials;
        $source = $resolvedCredentials['source'] ?? 'shared';

        if ($allowPostmanBypass) {
            Log::info('Postman webhook signature bypassed', [
                'content_length' => strlen((string) $request->getContent()),
                'source' => $source,
            ]);
        } elseif (!config('services.meta.mock_mode')) {
            $signature = $request->header('X-Hub-Signature-256') ?? $request->header('X-Hub-Signature');
            if ($resolvedCredentials === null) {
                $resolvedCredentials = $this->credentialsResolver->resolveShared();
                $source = 'shared';
            }
            $appSecret = $resolvedCredentials['app_secret'] ?? null;
            $rawBody = (string) $request->getContent();

            if (!$appSecret) {
                Log::error('Meta webhook rejected: missing app secret', ['source' => $source]);
                abort(500, 'Webhook secret not configured');
            }

            if (!$signature || !$this->verifySignature($rawBody, $signature, $appSecret)) {
                Log::warning('Invalid webhook signature from ' . $request->ip(), [
                    'source' => $source,
                ]);
                abort(403, 'Invalid signature');
            }

            Log::info('Meta Signature Verified', [
                'payload_len' => strlen($rawBody),
                'source' => $source,
            ]);
        } else {
            Log::info('Mock Mode: Skipping webhook signature verification.', [
                'source' => $source,
            ]);
        }

        $payload = $request->all();

        if (isset($payload['object']) && $payload['object'] === 'page') {
            $entries = is_array($payload['entry'] ?? null) ? $payload['entry'] : [];
            foreach ($entries as $entry) {
                $changes = is_array($entry['changes'] ?? null) ? $entry['changes'] : [];
                foreach ($changes as $change) {
                    Log::info('Meta Webhook Change Observed', [
                        'entry_id' => $entry['id'] ?? null,
                        'field' => $change['field'] ?? null,
                        'source' => $source,
                    ]);

                    if (isset($change['field']) && $change['field'] === 'leadgen') {
                        $value = $change['value'] ?? [];
                        $pageId = $entry['id'] ?? ($value['page_id'] ?? null);
                        $leadGenId = $value['leadgen_id'] ?? null;

                        if ($leadGenId && $pageId) {
                            $resolvedTenantId = $this->findTenantIdByPageId($pageId);

                            if ($resolvedTenantId) {
                                if (
                                    $source === 'custom'
                                    && isset($resolvedCredentials['tenant_id'])
                                    && (string) $resolvedCredentials['tenant_id'] !== (string) $resolvedTenantId
                                ) {
                                    Log::warning('Meta webhook tenant mismatch for custom app webhook key', [
                                        'webhook_tenant_id' => $resolvedCredentials['tenant_id'],
                                        'page_tenant_id' => $resolvedTenantId,
                                        'page_id' => $pageId,
                                    ]);
                                    continue;
                                }

                                Log::info('Meta Lead Dispatching', [
                                    'tenant_id' => $resolvedTenantId,
                                    'page_id' => $pageId,
                                    'leadgen_id' => $leadGenId,
                                    'source' => $source,
                                ]);
                                \App\Jobs\ProcessMetaLead::dispatch($resolvedTenantId, $leadGenId, $pageId);
                            } else {
                                Log::warning("No tenant found for page_id: {$pageId}");
                            }
                        }
                    }
                }
            }
        }

        if (isset($payload['object']) && in_array($payload['object'], ['whatsapp_business_account', 'whatsapp_business_phone_number'], true)) {
            if ($source === 'custom') {
                Log::info('Ignoring WhatsApp payload on tenant Meta webhook route', [
                    'object' => $payload['object'],
                    'tenant_id' => $resolvedCredentials['tenant_id'] ?? null,
                ]);
                return;
            }

            app(\App\Services\Whatsapp\WhatsappInboundService::class)->handlePayload($payload);
        }
    }

    protected function verifySignature($payload, $signatureHeader, $appSecret)
    {
        if (empty($signatureHeader)) {
            return false;
        }

        $parts = explode('=', $signatureHeader);
        if (count($parts) !== 2) {
            return false;
        }

        $algo = $parts[0];
        $hash = $parts[1];

        if (!in_array($algo, ['sha1', 'sha256'])) {
            return false;
        }

        $expected = hash_hmac($algo, $payload, $appSecret);

        return hash_equals($expected, $hash);
    }

    protected function findTenantIdByPageId($pageId)
    {
        $pages = \App\Models\MetaPage::where('page_id', $pageId)
            ->where('is_active', true)
            ->orderByDesc('updated_at')
            ->get();

        if ($pages->count() > 1) {
            Log::error('Meta webhook rejected: multiple tenants linked to the same page_id', [
                'page_id' => $pageId,
                'tenant_ids' => $pages->pluck('tenant_id')->all(),
            ]);

            return null;
        }

        $page = $pages->first();

        return $page ? $page->tenant_id : null;
    }
}
