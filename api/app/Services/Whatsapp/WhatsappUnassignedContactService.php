<?php

namespace App\Services\Whatsapp;

use App\Models\Lead;
use App\Models\User;
use App\Models\WhatsappMessage;
use App\Models\WhatsappMirrorSession;
use App\Models\WhatsappUnassignedContact;
use App\Support\LeadPhoneMatcher;
use Carbon\CarbonInterface;

class WhatsappUnassignedContactService
{
    public function recordPendingMessage(
        int $tenantId,
        string $phone,
        ?string $pushName = null,
        ?string $lastMessageBody = null,
        ?CarbonInterface $occurredAt = null,
        bool $incrementCount = true,
        ?bool $isUnresolvedLid = null,
        bool $fromMe = false
    ): ?WhatsappUnassignedContact {
        $normalizedPhone = $this->normalizePhone($phone);
        if ($tenantId <= 0 || $normalizedPhone === '') {
            return null;
        }

        $timestamp = $occurredAt ?: now();
        [$normalizedPhone, $isUnresolvedLid] = $this->resolveStoredPhone(
            $tenantId,
            $normalizedPhone,
            $isUnresolvedLid
        );
        $contact = WhatsappUnassignedContact::query()->firstOrNew([
            'tenant_id' => $tenantId,
            'phone' => $normalizedPhone,
        ]);

        $contact->status = 'pending';
        $contact->converted_lead_id = null;

        // Once we resolve a real phone number for this contact (isUnresolvedLid
        // becomes false), keep it corrected going forward. Never "downgrade" a
        // previously-resolved contact back to unresolved based on a stale flag.
        if ($isUnresolvedLid !== null && !($isUnresolvedLid && $contact->is_unresolved_lid === false)) {
            $contact->is_unresolved_lid = $isUnresolvedLid;
        }

        $this->applyCustomerPushName($contact, $pushName, $fromMe);
        $this->applyMessagePreview($contact, $lastMessageBody, $timestamp);

        $contact->messages_count = (int) ($contact->messages_count ?? 0);
        if ($incrementCount) {
            $contact->messages_count++;
        }

        if (!$contact->first_message_at) {
            $contact->first_message_at = $timestamp;
        }

        $contact->save();

        return $contact;
    }

    public function markAsConverted(
        int $tenantId,
        string $phone,
        int $leadId,
        ?string $pushName = null,
        ?string $lastMessageBody = null,
        ?CarbonInterface $occurredAt = null,
        bool $createIfMissing = false,
        bool $fromMe = false
    ): ?WhatsappUnassignedContact {
        $normalizedPhone = $this->normalizePhone($phone);
        if ($tenantId <= 0 || $leadId <= 0 || $normalizedPhone === '') {
            return null;
        }

        [$normalizedPhone] = $this->resolveStoredPhone($tenantId, $normalizedPhone, null);

        $query = WhatsappUnassignedContact::query()
            ->where('tenant_id', $tenantId)
            ->where('phone', $normalizedPhone);

        $contact = $createIfMissing
            ? $query->firstOrNew()
            : $query->first();

        if (!$contact) {
            return null;
        }

        $timestamp = $occurredAt ?: now();

        if (!$contact->exists) {
            $contact->tenant_id = $tenantId;
            $contact->phone = $normalizedPhone;
            $contact->first_message_at = $timestamp;
            $contact->last_message_at = $timestamp;
            $contact->messages_count = 0;
        }

        $contact->status = 'converted';
        $contact->converted_lead_id = $leadId;
        // A converted lead always carries a real phone number, so this contact
        // can no longer be considered an unresolved LID.
        $contact->is_unresolved_lid = false;

        $this->applyCustomerPushName($contact, $pushName, $fromMe);
        $this->applyMessagePreview($contact, $lastMessageBody, $timestamp);

        if (!$contact->last_message_at) {
            $contact->last_message_at = $timestamp;
        }

        $contact->save();

        return $contact;
    }

    public function attachLeadToMatchingMessages(int $tenantId, Lead $lead): int
    {
        $variants = LeadPhoneMatcher::buildLeadPhoneVariants($lead);
        if (empty($variants)) {
            return 0;
        }

        return WhatsappMessage::query()
            ->where('tenant_id', $tenantId)
            ->whereNull('lead_id')
            ->where(function ($query) use ($variants) {
                foreach ($variants as $variant) {
                    $query->orWhere('from', $variant)->orWhere('to', $variant);
                }
            })
            ->update(['lead_id' => $lead->id]);
    }

    public function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', trim($phone)) ?: '';
    }

    private function resolveStoredPhone(int $tenantId, string $normalizedPhone, ?bool $isUnresolvedLid): array
    {
        $looksLikeLid = $isUnresolvedLid === true || strlen($normalizedPhone) >= 14;
        if (!$looksLikeLid) {
            return [$normalizedPhone, $isUnresolvedLid];
        }

        $resolved = app(WhatsappContactStoreService::class)->resolvePhoneForLid($tenantId, $normalizedPhone);
        if (!is_string($resolved) || $resolved === '') {
            return [$normalizedPhone, $isUnresolvedLid];
        }

        $resolvedPhone = $this->normalizePhone($resolved);
        if ($resolvedPhone === '' || $resolvedPhone === $normalizedPhone) {
            return [$normalizedPhone, $isUnresolvedLid];
        }

        return [$resolvedPhone, false];
    }

    public function findFirstConversationMessage(int $tenantId, string $phone): ?WhatsappMessage
    {
        $variants = LeadPhoneMatcher::buildPhoneVariants($phone);
        if ($variants === []) {
            return null;
        }

        return WhatsappMessage::query()
            ->where('tenant_id', $tenantId)
            ->where(function ($query) use ($variants) {
                foreach ($variants as $variant) {
                    $query->orWhere('from', $variant)->orWhere('to', $variant);
                }
            })
            ->whereNotNull('body')
            ->where('body', '!=', '')
            ->orderBy('created_at')
            ->orderBy('id')
            ->first();
    }

    public function fillFirstMessageFromHistory(WhatsappUnassignedContact $contact): bool
    {
        if (!empty($contact->first_message_body)) {
            return false;
        }

        $first = $this->findFirstConversationMessage((int) $contact->tenant_id, (string) $contact->phone);
        $body = $this->cleanText($first?->body);
        if ($body === null) {
            return false;
        }

        $contact->first_message_body = $body;
        if (
            !$contact->first_message_at
            || ($first->created_at && $this->timestampSeconds($first->created_at) < $this->timestampSeconds($contact->first_message_at))
        ) {
            $contact->first_message_at = $first->created_at;
        }

        $contact->save();

        return true;
    }

    public function backfillMissingFirstMessages(?int $tenantId = null): int
    {
        $updated = 0;

        $query = WhatsappUnassignedContact::query()
            ->where(function ($inner) {
                $inner->whereNull('first_message_body')->orWhere('first_message_body', '');
            });

        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $query->orderBy('id')->chunkById(100, function ($contacts) use (&$updated) {
            foreach ($contacts as $contact) {
                if ($this->fillFirstMessageFromHistory($contact)) {
                    $updated++;
                }
            }
        });

        return $updated;
    }

    public function ownAccountNames(int $tenantId): array
    {
        $names = User::query()
            ->where('tenant_id', $tenantId)
            ->pluck('name')
            ->all();

        $sessionPhone = WhatsappMirrorSession::query()
            ->where('tenant_id', $tenantId)
            ->value('connected_phone_number');

        if (is_string($sessionPhone) && $sessionPhone !== '') {
            $ownContactName = $this->findStoredContactName($tenantId, $sessionPhone);
            if ($ownContactName !== null) {
                $names[] = $ownContactName;
            }
        }

        $repeatedNames = WhatsappUnassignedContact::query()
            ->where('tenant_id', $tenantId)
            ->whereNotNull('push_name')
            ->where('push_name', '!=', '')
            ->select('push_name')
            ->groupBy('push_name')
            ->havingRaw('COUNT(*) >= 3')
            ->pluck('push_name')
            ->all();

        $names = array_merge($names, $repeatedNames);

        $normalized = [];
        foreach ($names as $name) {
            $clean = $this->cleanText(is_string($name) ? $name : null);
            if ($clean !== null) {
                $normalized[mb_strtolower($clean)] = true;
            }
        }

        return array_keys($normalized);
    }

    public function fillCustomerNameFromHistory(WhatsappUnassignedContact $contact, ?array $ownNames = null): bool
    {
        $ownNames = $ownNames ?? $this->ownAccountNames((int) $contact->tenant_id);
        $ownLookup = array_fill_keys($ownNames, true);
        $current = $this->cleanText($contact->push_name);
        $currentIsOwn = $current !== null && isset($ownLookup[mb_strtolower($current)]);

        if ($current !== null && !$currentIsOwn) {
            return false;
        }

        $customerName = $this->findCustomerPushName(
            (int) $contact->tenant_id,
            (string) $contact->phone,
            $current === null ? [] : $ownNames
        );

        if ($customerName === null || $customerName === $current) {
            return false;
        }

        $contact->push_name = $customerName;
        $contact->save();

        return true;
    }

    public function backfillMissingCustomerNames(?int $tenantId = null): int
    {
        $updated = 0;
        $ownNamesByTenant = [];

        $query = WhatsappUnassignedContact::query();
        if ($tenantId) {
            $query->where('tenant_id', $tenantId);
        }

        $query->orderBy('id')->chunkById(100, function ($contacts) use (&$updated, &$ownNamesByTenant) {
            foreach ($contacts as $contact) {
                $contactTenantId = (int) $contact->tenant_id;
                if (!isset($ownNamesByTenant[$contactTenantId])) {
                    $ownNamesByTenant[$contactTenantId] = $this->ownAccountNames($contactTenantId);
                }

                if ($this->fillCustomerNameFromHistory($contact, $ownNamesByTenant[$contactTenantId])) {
                    $updated++;
                }
            }
        });

        return $updated;
    }

    public function findCustomerPushName(int $tenantId, string $phone, ?array $ownNames = null): ?string
    {
        $ownLookup = array_fill_keys($ownNames ?? $this->ownAccountNames($tenantId), true);

        foreach ([
            $this->findInboundPushName($tenantId, $phone),
            $this->findStoredContactName($tenantId, $phone),
        ] as $candidate) {
            if ($candidate !== null && !isset($ownLookup[mb_strtolower($candidate)])) {
                return $candidate;
            }
        }

        return null;
    }

    private function applyCustomerPushName(
        WhatsappUnassignedContact $contact,
        ?string $pushName,
        bool $fromMe
    ): void {
        if ($fromMe) {
            return;
        }

        $cleanPushName = $this->cleanText($pushName);
        if ($cleanPushName !== null && empty($contact->push_name)) {
            $contact->push_name = $cleanPushName;
        }
    }

    private function findInboundPushName(int $tenantId, string $phone): ?string
    {
        $variants = LeadPhoneMatcher::buildPhoneVariants($phone);
        if ($variants === []) {
            return null;
        }

        $messages = WhatsappMessage::query()
            ->where('tenant_id', $tenantId)
            ->where('direction', 'inbound')
            ->where(function ($query) use ($variants) {
                foreach ($variants as $variant) {
                    $query->orWhere('from', $variant)->orWhere('to', $variant);
                }
            })
            ->orderBy('created_at')
            ->orderBy('id')
            ->limit(20)
            ->get(['id', 'raw']);

        foreach ($messages as $message) {
            $name = $this->extractPushNameFromRaw($message->raw);
            if ($name !== null) {
                return $name;
            }
        }

        return null;
    }

    private function findStoredContactName(int $tenantId, string $phone): ?string
    {
        return $this->cleanText(
            app(WhatsappContactStoreService::class)->resolveNameForIdentifiers($tenantId, [$phone])
        );
    }

    private function extractPushNameFromRaw(mixed $raw): ?string
    {
        if (!is_array($raw)) {
            return null;
        }

        $nested = is_array($raw['message'] ?? null) ? $raw['message'] : [];

        foreach ([
            $raw['pushName'] ?? null,
            $raw['push_name'] ?? null,
            $nested['pushName'] ?? null,
            $nested['push_name'] ?? null,
        ] as $candidate) {
            $clean = $this->cleanText(is_string($candidate) ? $candidate : null);
            if ($clean !== null) {
                return $clean;
            }
        }

        return null;
    }

    private function applyMessagePreview(
        WhatsappUnassignedContact $contact,
        ?string $messageBody,
        CarbonInterface $timestamp
    ): void {
        $cleanMessageBody = $this->cleanText($messageBody);

        if ($this->shouldStoreAsLastMessage($contact, $timestamp)) {
            $contact->last_message_at = $timestamp;
            if ($cleanMessageBody !== null) {
                $contact->last_message_body = $cleanMessageBody;
            }
        }

        if ($cleanMessageBody === null || !$this->shouldStoreAsFirstMessage($contact, $timestamp)) {
            return;
        }

        $contact->first_message_body = $cleanMessageBody;
        if (
            !$contact->first_message_at
            || $this->timestampSeconds($timestamp) <= $this->timestampSeconds($contact->first_message_at)
        ) {
            $contact->first_message_at = $timestamp;
        }
    }

    private function shouldStoreAsFirstMessage(
        WhatsappUnassignedContact $contact,
        CarbonInterface $timestamp
    ): bool {
        if (empty($contact->first_message_body)) {
            if (!$contact->first_message_at) {
                return true;
            }

            // Existing rows may already have first_message_at from the original
            // conversation. Only backfill the body from a message at or before that.
            return $this->timestampSeconds($timestamp) <= $this->timestampSeconds($contact->first_message_at);
        }

        return $contact->first_message_at
            && $this->timestampSeconds($timestamp) < $this->timestampSeconds($contact->first_message_at);
    }

    private function shouldStoreAsLastMessage(
        WhatsappUnassignedContact $contact,
        CarbonInterface $timestamp
    ): bool {
        return !$contact->last_message_at
            || $this->timestampSeconds($timestamp) >= $this->timestampSeconds($contact->last_message_at);
    }

    private function timestampSeconds(CarbonInterface $timestamp): int
    {
        return $timestamp->getTimestamp();
    }

    private function cleanText(?string $value): ?string
    {
        $value = is_string($value) ? trim($value) : '';
        return $value !== '' ? $value : null;
    }
}
