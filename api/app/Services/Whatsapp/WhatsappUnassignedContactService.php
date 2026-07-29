<?php

namespace App\Services\Whatsapp;

use App\Models\Lead;
use App\Models\WhatsappMessage;
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
        ?bool $isUnresolvedLid = null
    ): ?WhatsappUnassignedContact {
        $normalizedPhone = $this->normalizePhone($phone);
        if ($tenantId <= 0 || $normalizedPhone === '') {
            return null;
        }

        $timestamp = $occurredAt ?: now();
        $contact = WhatsappUnassignedContact::query()->firstOrNew([
            'tenant_id' => $tenantId,
            'phone' => $normalizedPhone,
        ]);

        if (!$contact->exists && !$contact->first_message_at) {
            $contact->first_message_at = $timestamp;
        }

        $contact->last_message_at = $timestamp;
        $contact->status = 'pending';
        $contact->converted_lead_id = null;

        // Once we resolve a real phone number for this contact (isUnresolvedLid
        // becomes false), keep it corrected going forward. Never "downgrade" a
        // previously-resolved contact back to unresolved based on a stale flag.
        if ($isUnresolvedLid !== null && !($isUnresolvedLid && $contact->is_unresolved_lid === false)) {
            $contact->is_unresolved_lid = $isUnresolvedLid;
        }

        $cleanPushName = $this->cleanText($pushName);
        if ($cleanPushName !== null) {
            $contact->push_name = $cleanPushName;
        }

        $cleanMessageBody = $this->cleanText($lastMessageBody);
        if ($cleanMessageBody !== null) {
            $contact->last_message_body = $cleanMessageBody;
        }

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
        bool $createIfMissing = false
    ): ?WhatsappUnassignedContact {
        $normalizedPhone = $this->normalizePhone($phone);
        if ($tenantId <= 0 || $leadId <= 0 || $normalizedPhone === '') {
            return null;
        }

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

        $cleanPushName = $this->cleanText($pushName);
        if ($cleanPushName !== null) {
            $contact->push_name = $cleanPushName;
        }

        $cleanMessageBody = $this->cleanText($lastMessageBody);
        if ($cleanMessageBody !== null) {
            $contact->last_message_body = $cleanMessageBody;
        }

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

    private function cleanText(?string $value): ?string
    {
        $value = is_string($value) ? trim($value) : '';
        return $value !== '' ? $value : null;
    }
}
