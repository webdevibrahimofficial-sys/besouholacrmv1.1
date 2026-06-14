<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use App\Services\TenantMetaCredentialsResolver;

class MetaWebhookService
{
    public function __construct(protected TenantMetaCredentialsResolver $credentialsResolver)
    {
    }

    public function handleWebhook(Request $request, $tenantId = null)
    {
        // Allow explicit Postman smoke tests without a Meta signature.
        if ($request->header('X-Webhook-Test') === 'postman') {
            Log::info('Postman webhook signature bypassed', [
                'tenant_id' => $tenantId,
                'content_length' => strlen((string) $request->getContent()),
            ]);
        } elseif (!config('services.meta.mock_mode')) {
            // Verify signature
            $signature = $request->header('X-Hub-Signature-256') ?? $request->header('X-Hub-Signature');
            $credentials = $this->credentialsResolver->resolveForTenant($tenantId);
            $appSecret = $credentials['app_secret'] ?? null;
            $rawBody = (string) $request->getContent();

            Log::info('Meta Signature Debug', [
                'tenant_id' => $tenantId,
                'signature_present' => !empty($signature),
                'signature_header' => $signature ? explode('=', $signature, 2)[0] : null,
                'payload_len' => strlen($rawBody),
                'app_secret_len' => strlen((string) $appSecret),
                'content_type' => $request->header('Content-Type'),
            ]);
            Log::info('Meta Signature Full Debug', [
                'tenant_id' => $tenantId,
                'signature' => $signature,
                'content_length' => strlen($rawBody),
            ]);

            if (!$appSecret) {
                Log::error('Meta webhook rejected: missing app secret');
                abort(500, 'Webhook secret not configured');
            }
            
            // Signature format: sha1=... or sha256=...
            // $signature header contains "algo=hash"
            
            if (!$signature || !$this->verifySignature($rawBody, $signature, $appSecret)) {
                Log::warning("Invalid webhook signature from " . $request->ip());
                abort(403, 'Invalid signature');
            }

            Log::info('Meta Signature Verified', [
                'tenant_id' => $tenantId,
                'payload_len' => strlen($rawBody),
            ]);
        } else {
            Log::info("Mock Mode: Skipping webhook signature verification.");
        }

        $payload = $request->all();
        
        if (isset($payload['object']) && $payload['object'] === 'page') {
            $entries = is_array($payload['entry'] ?? null) ? $payload['entry'] : [];
            foreach ($entries as $entry) {
                $changes = is_array($entry['changes'] ?? null) ? $entry['changes'] : [];
                foreach ($changes as $change) {
                    Log::info('Meta Webhook Change Observed', [
                        'tenant_id' => $tenantId,
                        'entry_id' => $entry['id'] ?? null,
                        'field' => $change['field'] ?? null,
                        'value_keys' => is_array($change['value'] ?? null) ? array_keys($change['value']) : [],
                    ]);

                    if (isset($change['field']) && $change['field'] === 'leadgen') {
                        $value = $change['value'] ?? [];
                        $pageId = $entry['id'] ?? ($value['page_id'] ?? null);
                        $leadGenId = $value['leadgen_id'] ?? null;
                        
                        if ($leadGenId && $pageId) {
                            // Find tenant by page_id
                            $resolvedTenantId = $tenantId ?: $this->findTenantIdByPageId($pageId);
                            
                            if ($resolvedTenantId) {
                                Log::info('Meta Lead Dispatching', [
                                    'tenant_id' => $resolvedTenantId,
                                    'page_id' => $pageId,
                                    'leadgen_id' => $leadGenId,
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
        // Find MetaPage by page_id
        $page = \App\Models\MetaPage::where('page_id', $pageId)->first();
        return $page ? $page->tenant_id : null;
    }
}
