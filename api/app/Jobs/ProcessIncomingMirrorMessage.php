<?php

namespace App\Jobs;

use App\Events\InboundWhatsappMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use App\Models\WhatsappMessage;
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

        if (!$tenantId || empty($msgData['from'])) {
            Log::warning('[Mirror Job Warning] Missing tenant_id or sender number.', [
                'tenant_id' => $tenantId,
                'payload' => $this->payload,
            ]);
            return;
        }

        try {
            $message = WhatsappMessage::firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'message_id' => $msgData['message_id'] ?? null,
                ],
                [
                    'tenant_id' => $tenantId,
                    'provider' => 'mirror',
                    'direction' => 'inbound',
                    'from' => $msgData['from'],
                    'to' => $msgData['to'] ?? null,
                    'type' => $msgData['type'] ?? 'text',
                    'status' => 'received',
                    'message_id' => $msgData['message_id'] ?? null,
                    'body' => $msgData['body'] ?? '',
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
