<?php

namespace App\Jobs;

use App\Events\InboundWhatsappMessage;
use App\Models\WhatsappMessage;
use App\Models\WhatsappMirrorSession;
use App\Support\LeadPhoneMatcher;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

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

        $session = WhatsappMirrorSession::where('tenant_id', $tenantId)->first();
        $ownNumber = $session?->connected_phone_number;

        $from = $direction === 'inbound' ? $counterpartPhone : $ownNumber;
        $to = $direction === 'outbound' ? $counterpartPhone : $ownNumber;

        $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $counterpartPhone);
        $resolvedLeadId = $lead?->id;

        try {
            $message = WhatsappMessage::firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'message_id' => $msgData['message_id'] ?? null,
                ],
                [
                    'tenant_id' => $tenantId,
                    'provider' => 'mirror',
                    'source' => 'live',
                    'direction' => $direction,
                    'from' => $from,
                    'to' => $to,
                    'type' => $msgData['type'] ?? 'text',
                    'status' => $direction === 'outbound' ? 'sent' : 'received',
                    'message_id' => $msgData['message_id'] ?? null,
                    'body' => $msgData['body'] ?? '',
                    'lead_id' => $resolvedLeadId,
                    'raw' => $this->payload,
                ]
            );

            if ($message->wasRecentlyCreated) {
                event(new InboundWhatsappMessage($tenantId, [
                    'id' => $message->id,
                    'body' => $message->body,
                    'from' => $message->from,
                    'to' => $message->to,
                    'direction' => $message->direction,
                    'timestamp' => $message->created_at?->toISOString(),
                ]));
            }
        } catch (\Exception $e) {
            Log::error("[Mirror Job Error] Tenant {$tenantId}: " . $e->getMessage());
        }
    }
}
