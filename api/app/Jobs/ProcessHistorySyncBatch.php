<?php

namespace App\Jobs;

use App\Models\WhatsappMessage;
use App\Models\WhatsappMirrorSession;
use App\Services\Whatsapp\WhatsappGroupContactService;
use App\Services\Whatsapp\WhatsappUnassignedContactService;
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

        // Guard: skip only if we are within a 2-minute dedup window AND this
        // is not a fresh isLatest=true batch (which signals a new reconnect sync).
        if (!$this->isLatest && $session?->history_synced_at) {
            $minutesSinceSync = now()->diffInMinutes($session->history_synced_at);
            if ($minutesSinceSync < 2) {
                Log::info("[History Sync] Skipping duplicate burst for tenant {$tenantId}.");
                return;
            }
        }

        $processedCount = 0;
        $unmatchedCount = 0;
        $unassignedContactService = app(WhatsappUnassignedContactService::class);
        $groupContactService = app(WhatsappGroupContactService::class);

        foreach ($this->messages as $msg) {
            $phone = $msg['phone'] ?? null;
            if (empty($phone)) {
                continue;
            }

            $rawIdentifiers = [
                'message_id' => $msg['message_id'] ?? null,
                'sender_pn' => $msg['sender_pn'] ?? null,
                'participant_pn' => $msg['participant_pn'] ?? null,
                'participant' => $msg['participant'] ?? null,
                'remote_jid' => $msg['remote_jid'] ?? null,
                'sender' => $msg['sender'] ?? null,
                'author' => $msg['author'] ?? null,
                'phone' => $phone,
            ];

            $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $phone);

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
                        'type' => $msg['type'] ?? 'text',
                        'status' => $direction === 'outbound' ? 'sent' : 'received',
                        'message_id' => $msg['message_id'] ?? null,
                        'body' => $msg['body'] ?? '',
                        'lead_id' => $lead?->id,
                        'raw' => $msg,
                    ]
                );

                $groupContactService->autoResolveFromMessageEvent(
                    $tenantId,
                    $rawIdentifiers,
                    (string) $phone,
                    $message->created_at
                );

                if (!$lead) {
                    // Upsert regardless of wasRecentlyCreated — history re-syncs
                    // after a reconnect must still register contacts whose messages
                    // already exist in whatsapp_messages.
                    if ($message->wasRecentlyCreated) {
                        $unmatchedCount++;
                    }
                    $unassignedContactService->recordPendingMessage(
                        $tenantId,
                        (string) $phone,
                        is_string($msg['pushName'] ?? $msg['push_name'] ?? null) ? ($msg['pushName'] ?? $msg['push_name']) : null,
                        is_string($msg['body'] ?? null) ? $msg['body'] : null,
                        $message->created_at,
                        $message->wasRecentlyCreated, // only increment count for new messages
                        (bool) ($msg['is_unresolved_lid'] ?? false)
                    );
                } elseif ($lead) {
                    $unassignedContactService->markAsConverted(
                        $tenantId,
                        (string) $phone,
                        (int) $lead->id,
                        is_string($msg['pushName'] ?? $msg['push_name'] ?? null) ? ($msg['pushName'] ?? $msg['push_name']) : null,
                        is_string($msg['body'] ?? null) ? $msg['body'] : null,
                        $message->created_at,
                        false
                    );
                }

                $processedCount++;
            } catch (\Exception $e) {
                Log::error("[History Sync Batch Error] Tenant {$tenantId}: " . $e->getMessage());
            }
        }

        Log::info("[History Sync] Tenant {$tenantId} processed {$processedCount} messages, unmatched {$unmatchedCount}.");

        if ($session && ($this->isLatest || (!$session->history_synced_at && !empty($this->messages)))) {
            $session->update(['history_synced_at' => now()]);
        }
    }
}
