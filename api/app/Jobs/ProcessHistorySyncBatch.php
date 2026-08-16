<?php

namespace App\Jobs;

use App\Models\WhatsappMessage;
use App\Models\WhatsappMirrorSession;
use App\Services\Whatsapp\WhatsappContactStoreService;
use App\Services\Whatsapp\WhatsappGroupContactService;
use App\Services\Whatsapp\WhatsappUnassignedContactService;
use App\Support\LeadPhoneMatcher;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

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
        $contactStore = app(WhatsappContactStoreService::class);
        $contactObservations = [];

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
            $counterpartLid = $this->extractCounterpartLid($rawIdentifiers);
            $contactObservations[] = [
                'jid' => $msg['remote_jid'] ?? null,
                'lid' => $counterpartLid,
                'phone' => $this->isUnresolvedLid($phone) ? null : $phone,
                'push_name' => is_string($msg['pushName'] ?? $msg['push_name'] ?? null) ? ($msg['pushName'] ?? $msg['push_name']) : null,
                'source' => 'history_sync',
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
                        'counterpart_lid' => Schema::hasColumn('whatsapp_messages', 'counterpart_lid') ? $counterpartLid : null,
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

                $rawPushName = $msg['pushName'] ?? $msg['push_name'] ?? null;
                $customerPushName = $fromMe || !is_string($rawPushName) ? null : $rawPushName;

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
                        $customerPushName,
                        is_string($msg['body'] ?? null) ? $msg['body'] : null,
                        $message->created_at,
                        $message->wasRecentlyCreated, // only increment count for new messages
                        (bool) ($msg['is_unresolved_lid'] ?? false),
                        (bool) $fromMe
                    );
                } elseif ($lead) {
                    $unassignedContactService->markAsConverted(
                        $tenantId,
                        (string) $phone,
                        (int) $lead->id,
                        $customerPushName,
                        is_string($msg['body'] ?? null) ? $msg['body'] : null,
                        $message->created_at,
                        false,
                        (bool) $fromMe
                    );
                }

                $processedCount++;
            } catch (\Exception $e) {
                Log::error("[History Sync Batch Error] Tenant {$tenantId}: " . $e->getMessage());
            }
        }

        if (!empty($contactObservations)) {
            $contactStore->upsertMany($tenantId, $contactObservations);
        }

        Log::info("[History Sync] Tenant {$tenantId} processed {$processedCount} messages, unmatched {$unmatchedCount}.");

        if ($session && ($this->isLatest || (!$session->history_synced_at && !empty($this->messages)))) {
            $session->update(['history_synced_at' => now()]);
        }
    }

    private function extractCounterpartLid(array $identifiers): ?string
    {
        foreach (['participant', 'remote_jid', 'sender', 'author', 'phone'] as $key) {
            $lid = $this->extractLid($identifiers[$key] ?? null);
            if ($lid) {
                return $lid;
            }
        }

        return null;
    }

    private function extractLid(mixed $value): ?string
    {
        if (!is_scalar($value)) {
            return null;
        }

        $raw = trim((string) $value);
        if ($raw === '' || (!str_contains(strtolower($raw), '@lid') && !preg_match('/^\d{14,}$/', $raw))) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', explode('@', $raw)[0] ?? '') ?: '';
        return $digits !== '' ? $digits : null;
    }

    private function isUnresolvedLid(?string $value): bool
    {
        $digits = preg_replace('/\D+/', '', (string) ($value ?? '')) ?: '';
        return $digits !== '' && strlen($digits) >= 14;
    }
}
