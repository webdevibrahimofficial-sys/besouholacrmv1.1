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

class ProcessHistorySyncBatch implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tenantId;
    protected array $messages;
    protected bool $isLatest;

    public function __construct(int $tenantId, array $messages, bool $isLatest = false)
    {
        $this->tenantId = $tenantId;
        $this->messages = $messages;
        $this->isLatest = $isLatest;
    }

    public function handle(): void
    {
        $tenantId = $this->tenantId;
        $session = WhatsappMirrorSession::where('tenant_id', $tenantId)->first();
        $ownNumber = $session?->connected_phone_number;

        // Guard: if history was already synced and this is NOT a continuation
        // of a sync in progress (within 5 minutes of the last sync), skip.
        if ($session?->history_synced_at) {
            $minutesSinceSync = now()->diffInMinutes($session->history_synced_at);
            if ($minutesSinceSync > 5) {
                Log::info("[History Sync] Skipping batch for tenant {$tenantId}: already synced.");
                return;
            }
        }

        $processedCount = 0;
        $skippedCount = 0;

        foreach ($this->messages as $msg) {
            $phone = $msg['phone'] ?? null;
            if (empty($phone)) {
                continue;
            }

            // Only import history for numbers that match an existing Lead
            $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $phone);
            if (!$lead) {
                $skippedCount++;
                continue;
            }

            $fromMe = $msg['from_me'] ?? false;
            $direction = $fromMe ? 'outbound' : 'inbound';
            $from = $direction === 'inbound' ? $phone : $ownNumber;
            $to = $direction === 'outbound' ? $phone : $ownNumber;

            try {
                $message = WhatsappMessage::firstOrCreate(
                    [
                        'tenant_id' => $tenantId,
                        'message_id' => $msg['message_id'] ?? null,
                    ],
                    [
                        'tenant_id' => $tenantId,
                        'provider' => 'mirror',
                        'source' => 'history_sync',
                        'direction' => $direction,
                        'from' => $from,
                        'to' => $to,
                        'type' => 'text',
                        'status' => $direction === 'outbound' ? 'sent' : 'received',
                        'message_id' => $msg['message_id'] ?? null,
                        'body' => $msg['body'] ?? '',
                        'lead_id' => $lead->id,
                        'raw' => $msg,
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

                $processedCount++;
            } catch (\Exception $e) {
                Log::error("[History Sync Batch Error] Tenant {$tenantId}: " . $e->getMessage());
            }
        }

        Log::info("[History Sync] Tenant {$tenantId} processed {$processedCount} messages, skipped {$skippedCount} (no lead match).");

        if ($this->isLatest && $session) {
            $session->update(['history_synced_at' => now()]);
        }
    }
}
