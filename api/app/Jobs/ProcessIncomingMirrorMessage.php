<?php

namespace App\Jobs;

use App\Events\InboundWhatsappMessage;
use App\Models\Lead;
use App\Models\WhatsappMessage;
use App\Models\WhatsappMirrorSession;
use App\Services\Whatsapp\WhatsappGroupContactService;
use App\Services\Whatsapp\WhatsappUnassignedContactService;
use App\Support\LeadPhoneMatcher;
use App\Services\Whatsapp\WhatsappInboundNotificationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

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
        $pushName = $msgData['pushName'] ?? $msgData['push_name'] ?? null;
        $messageBody = $msgData['body'] ?? '';
        $isUnresolvedLid = (bool) ($msgData['is_unresolved_lid'] ?? false);
        $rawIdentifiers = [
            'message_id' => $msgData['message_id'] ?? null,
            'sender_pn' => $msgData['sender_pn'] ?? null,
            'participant_pn' => $msgData['participant_pn'] ?? null,
            'participant' => $msgData['participant'] ?? null,
            'remote_jid' => $msgData['remote_jid'] ?? null,
            'sender' => $msgData['sender'] ?? null,
            'author' => $msgData['author'] ?? null,
            'phone' => $counterpartPhone,
        ];
        $counterpartLid = $this->extractCounterpartLid($rawIdentifiers);

        $session = WhatsappMirrorSession::where('tenant_id', $tenantId)->first();
        $ownNumber = $session?->connected_phone_number;

        $from = $direction === 'inbound' ? $counterpartPhone : $ownNumber;
        $to = $direction === 'outbound' ? $counterpartPhone : $ownNumber;

        $lead = LeadPhoneMatcher::findLeadByPhone($tenantId, $counterpartPhone);
        $resolvedLeadId = $lead?->id;

        try {
            $attributes = [
                'tenant_id' => $tenantId,
                'provider' => 'mirror',
                'direction' => $direction,
                'from' => $from,
                'to' => $to,
                'type' => $msgData['type'] ?? 'text',
                'status' => $direction === 'outbound' ? 'sent_to_session' : 'received',
                'message_id' => $msgData['message_id'] ?? null,
                'body' => $msgData['body'] ?? '',
                'raw' => $this->payload,
            ];

            if (Schema::hasColumn('whatsapp_messages', 'source')) {
                $attributes['source'] = 'live';
            }

            if (Schema::hasColumn('whatsapp_messages', 'lead_id')) {
                $attributes['lead_id'] = $resolvedLeadId;
            }

            if (Schema::hasColumn('whatsapp_messages', 'counterpart_lid')) {
                $attributes['counterpart_lid'] = $counterpartLid;
            }

            $message = WhatsappMessage::firstOrCreate(
                [
                    'tenant_id' => $tenantId,
                    'message_id' => $msgData['message_id'] ?? null,
                ],
                $attributes
            );

            $updates = [];
            foreach (['from', 'to', 'body', 'direction', 'status', 'type'] as $field) {
                if (($message->{$field} ?? null) !== ($attributes[$field] ?? null)) {
                    $updates[$field] = $attributes[$field] ?? null;
                }
            }

            if (
                $resolvedLeadId
                && Schema::hasColumn('whatsapp_messages', 'lead_id')
                && (int) ($message->lead_id ?? 0) !== (int) $resolvedLeadId
            ) {
                $updates['lead_id'] = $resolvedLeadId;
            }

            if (!empty($updates)) {
                $message->forceFill($updates)->save();
                $message->refresh();
            }

            $unassignedContactService = app(WhatsappUnassignedContactService::class);
            app(WhatsappGroupContactService::class)->autoResolveFromMessageEvent(
                $tenantId,
                $rawIdentifiers,
                (string) $counterpartPhone,
                $message->created_at
            );

            if (!$resolvedLeadId) {
                // Always upsert the unassigned contact so that contacts whose
                // first message arrived before the service was running (and thus
                // already have a whatsapp_messages row) still get registered.
                $unassignedContactService->recordPendingMessage(
                    $tenantId,
                    (string) $counterpartPhone,
                    is_string($pushName) ? $pushName : null,
                    is_string($messageBody) ? $messageBody : null,
                    $message->created_at,
                    $message->wasRecentlyCreated, // only increment count for new messages
                    $isUnresolvedLid
                );
            } elseif ($resolvedLeadId) {
                $unassignedContactService->markAsConverted(
                    $tenantId,
                    (string) $counterpartPhone,
                    (int) $resolvedLeadId,
                    is_string($pushName) ? $pushName : null,
                    is_string($messageBody) ? $messageBody : null,
                    $message->created_at,
                    false
                );
            }

            if ($message->wasRecentlyCreated && $resolvedLeadId) {
                $leadModel = $lead instanceof Lead
                    ? $lead
                    : Lead::query()->where('tenant_id', $tenantId)->find($resolvedLeadId);

                if ($leadModel) {
                    app(WhatsappInboundNotificationService::class)
                        ->notifyAssignedSales($leadModel, $message);
                }
            }

            if ($message->wasRecentlyCreated) {
                event(new InboundWhatsappMessage($tenantId, [
                    'id' => $message->id,
                    'lead_id' => $message->lead_id,
                    'message_id' => $message->message_id,
                    'body' => $message->body,
                    'from' => $message->from,
                    'to' => $message->to,
                    'direction' => $message->direction,
                    'status' => $message->status,
                    'type' => $message->type,
                    'timestamp' => $message->created_at?->toISOString(),
                ]));
            }
        } catch (\Exception $e) {
            Log::error("[Mirror Job Error] Tenant {$tenantId}: " . $e->getMessage());
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
}
