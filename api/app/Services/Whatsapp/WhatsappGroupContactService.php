<?php

namespace App\Services\Whatsapp;

use App\Models\WhatsappGroupContact;
use Carbon\CarbonInterface;

class WhatsappGroupContactService
{
    public function syncContacts(int $tenantId, array $contacts, ?CarbonInterface $syncedAt = null): array
    {
        $timestamp = $syncedAt ?: now();
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $unresolvedLids = [];

        foreach ($contacts as $contact) {
            $groupJid = trim((string) ($contact['group_jid'] ?? ''));
            $participantJid = $this->cleanText($contact['participant_jid'] ?? null);
            $lid = $this->extractLid($contact['lid'] ?? null)
                ?? $this->extractLid($participantJid);
            $normalizedPhone = $this->normalizePhone((string) ($contact['phone'] ?? ''));
            $resolvedPhone = $this->normalizePhone((string) ($contact['resolved_phone'] ?? ''));
            $isUnresolvedLid = filter_var($contact['is_unresolved_lid'] ?? false, FILTER_VALIDATE_BOOL);

            if ($tenantId <= 0 || $groupJid === '') {
                $skipped++;
                continue;
            }

            if ($resolvedPhone === '' && !$isUnresolvedLid && $lid === null) {
                $resolvedPhone = $normalizedPhone;
            }

            if ($resolvedPhone === '' && $normalizedPhone === '' && $lid !== null) {
                $normalizedPhone = $lid;
                $isUnresolvedLid = true;
            }

            if ($resolvedPhone === '' && $lid !== null && $normalizedPhone === $lid) {
                $isUnresolvedLid = true;
            }

            if ($resolvedPhone !== '' && $normalizedPhone === '') {
                $normalizedPhone = $resolvedPhone;
            }

            if ($normalizedPhone === '' && $resolvedPhone === '' && $lid === null) {
                $skipped++;
                continue;
            }

            $record = $this->findMatchingRecord(
                $tenantId,
                $groupJid,
                $lid,
                $participantJid,
                $resolvedPhone !== '' ? $resolvedPhone : null,
                $normalizedPhone !== '' ? $normalizedPhone : null
            ) ?? new WhatsappGroupContact([
                'tenant_id' => $tenantId,
                'group_jid' => $groupJid,
            ]);

            $record->group_name = $this->cleanText($contact['group_name'] ?? null) ?? $record->group_name;
            $record->participant_jid = $participantJid ?? $record->participant_jid;
            $record->lid = $lid ?? $record->lid;
            $record->push_name = $this->cleanText($contact['push_name'] ?? null) ?? $record->push_name;
            $record->last_synced_at = $timestamp;
            $record->resolved_phone = $resolvedPhone !== '' ? $resolvedPhone : $record->resolved_phone;
            $record->is_unresolved_lid = $resolvedPhone !== '' ? false : $isUnresolvedLid;
            $record->meta_data = $this->mergeMetaData($record->meta_data, [
                'raw_identifiers' => $this->sanitizeIdentifierPayload([
                    'participant_jid' => $participantJid,
                    'lid' => $lid,
                    'phone' => $normalizedPhone !== '' ? $normalizedPhone : null,
                    'resolved_phone' => $resolvedPhone !== '' ? $resolvedPhone : null,
                ]),
                'last_sync_source' => 'group_contacts_sync',
            ]);

            if ($resolvedPhone !== '') {
                $record = $this->applyResolvedPhoneToRecord($record, $resolvedPhone, $timestamp);
            } elseif ($normalizedPhone !== '') {
                $record->phone = $normalizedPhone;
            }

            $isNew = !$record->exists;

            if ($isNew && !$record->first_seen_at) {
                $record->first_seen_at = $timestamp;
            }

            if (!$record->converted_lead_id) {
                $record->status = 'pending';
            }

            $record->save();

            if ($record->is_unresolved_lid && $record->lid) {
                $unresolvedLids[] = $record->lid;
            }

            if ($isNew) {
                $created++;
            } else {
                $updated++;
            }
        }

        return [
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'unresolved_lids' => array_values(array_unique(array_filter($unresolvedLids))),
        ];
    }

    public function applyResolvedLidMap(int $tenantId, array $resolvedMap, ?CarbonInterface $resolvedAt = null): int
    {
        $timestamp = $resolvedAt ?: now();
        $normalizedMap = [];

        foreach ($resolvedMap as $lidKey => $realPhone) {
            $lid = $this->extractLid($lidKey);
            $phone = $this->normalizePhone((string) $realPhone);

            if ($lid && $phone !== '') {
                $normalizedMap[$lid] = $phone;
            }
        }

        if ($tenantId <= 0 || empty($normalizedMap)) {
            return 0;
        }

        $contacts = WhatsappGroupContact::query()
            ->where('tenant_id', $tenantId)
            ->where('is_unresolved_lid', true)
            ->where(function ($query) use ($normalizedMap) {
                $query->whereIn('lid', array_keys($normalizedMap))
                    ->orWhereIn('phone', array_keys($normalizedMap));
            })
            ->get();

        $resolvedCount = 0;

        foreach ($contacts as $contact) {
            $lookupKey = $contact->lid ?: $contact->phone;
            $resolvedPhone = $normalizedMap[(string) $lookupKey] ?? null;
            if (!$resolvedPhone) {
                continue;
            }

            $this->applyResolvedPhoneToRecord($contact, $resolvedPhone, $timestamp)->save();
            $resolvedCount++;
        }

        return $resolvedCount;
    }

    public function autoResolveFromMessageEvent(
        int $tenantId,
        array $rawIdentifiers,
        ?string $fallbackPhone = null,
        ?CarbonInterface $resolvedAt = null
    ): int {
        $timestamp = $resolvedAt ?: now();
        $payload = $this->sanitizeIdentifierPayload($rawIdentifiers);
        $resolvedPhone = $this->extractResolvedPhoneFromIdentifiers($payload, $fallbackPhone);
        $lids = $this->extractAllLidsFromIdentifiers($payload);

        if (empty($lids)) {
            return 0;
        }

        $contacts = WhatsappGroupContact::query()
            ->where('tenant_id', $tenantId)
            ->where('is_unresolved_lid', true)
            ->where(function ($query) use ($lids) {
                $query->whereIn('lid', $lids)
                    ->orWhereIn('phone', $lids)
                    ->orWhereIn('participant_jid', array_map(fn ($lid) => "{$lid}@lid", $lids));
            })
            ->get();

        foreach ($contacts as $contact) {
            $contact->meta_data = $this->mergeMetaData($contact->meta_data, [
                'raw_identifiers' => $payload,
                'last_message_identifier_update_at' => $timestamp->toISOString(),
            ]);
            $contact->save();
        }

        if ($resolvedPhone === null) {
            return 0;
        }

        $resolvedCount = 0;

        foreach ($contacts as $contact) {
            $contact->meta_data = $this->mergeMetaData($contact->meta_data, [
                'raw_identifiers' => $payload,
                'auto_resolved_at' => $timestamp->toISOString(),
                'auto_resolved_source' => 'message_event',
            ]);
            $this->applyResolvedPhoneToRecord($contact, $resolvedPhone, $timestamp)->save();
            $resolvedCount++;
        }

        return $resolvedCount;
    }

    public function markPhoneAsConverted(int $tenantId, string $phone, int $leadId): int
    {
        $normalizedPhone = $this->normalizePhone($phone);
        if ($tenantId <= 0 || $leadId <= 0 || $normalizedPhone === '') {
            return 0;
        }

        return WhatsappGroupContact::query()
            ->where('tenant_id', $tenantId)
            ->where(function ($query) use ($normalizedPhone) {
                $query->where('phone', $normalizedPhone)
                    ->orWhere('resolved_phone', $normalizedPhone)
                    ->orWhere('lid', $normalizedPhone);
            })
            ->update([
                'status' => 'converted',
                'converted_lead_id' => $leadId,
                'is_unresolved_lid' => false,
                'resolved_phone' => $normalizedPhone,
                'last_synced_at' => now(),
            ]);
    }

    private function findMatchingRecord(
        int $tenantId,
        string $groupJid,
        ?string $lid,
        ?string $participantJid,
        ?string $resolvedPhone,
        ?string $fallbackPhone
    ): ?WhatsappGroupContact {
        $base = WhatsappGroupContact::query()
            ->where('tenant_id', $tenantId)
            ->where('group_jid', $groupJid);

        if ($lid) {
            $byLid = (clone $base)->where('lid', $lid)->first();
            if ($byLid) {
                return $byLid;
            }
        }

        if ($participantJid) {
            $byParticipant = (clone $base)->where('participant_jid', $participantJid)->first();
            if ($byParticipant) {
                return $byParticipant;
            }
        }

        if ($resolvedPhone) {
            $byResolvedPhone = (clone $base)
                ->where(function ($query) use ($resolvedPhone) {
                    $query->where('resolved_phone', $resolvedPhone)
                        ->orWhere('phone', $resolvedPhone);
                })
                ->first();

            if ($byResolvedPhone) {
                return $byResolvedPhone;
            }
        }

        if ($fallbackPhone) {
            return (clone $base)->where('phone', $fallbackPhone)->first();
        }

        return null;
    }

    private function applyResolvedPhoneToRecord(
        WhatsappGroupContact $record,
        string $resolvedPhone,
        CarbonInterface $timestamp
    ): WhatsappGroupContact {
        $normalizedPhone = $this->normalizePhone($resolvedPhone);
        if ($normalizedPhone === '') {
            return $record;
        }

        $duplicate = null;
        if ($record->tenant_id && $record->group_jid) {
            $duplicate = WhatsappGroupContact::query()
                ->where('tenant_id', $record->tenant_id)
                ->where('group_jid', $record->group_jid)
                ->where(function ($query) use ($normalizedPhone) {
                    $query->where('phone', $normalizedPhone)
                        ->orWhere('resolved_phone', $normalizedPhone);
                })
                ->when($record->exists, fn ($query) => $query->where('id', '!=', $record->id))
                ->first();
        }

        if ($duplicate) {
            $duplicate->group_name = $duplicate->group_name ?: $record->group_name;
            $duplicate->participant_jid = $duplicate->participant_jid ?: $record->participant_jid;
            $duplicate->lid = $duplicate->lid ?: $record->lid;
            $duplicate->push_name = $duplicate->push_name ?: $record->push_name;
            $duplicate->resolved_phone = $normalizedPhone;
            $duplicate->phone = $normalizedPhone;
            $duplicate->is_unresolved_lid = false;
            $duplicate->first_seen_at = $this->earliestDate($duplicate->first_seen_at, $record->first_seen_at);
            $duplicate->last_synced_at = $timestamp;
            $duplicate->meta_data = $this->mergeMetaData($duplicate->meta_data, $record->meta_data);

            if ($record->converted_lead_id && !$duplicate->converted_lead_id) {
                $duplicate->converted_lead_id = $record->converted_lead_id;
                $duplicate->status = $record->status ?: 'converted';
            }

            $duplicate->save();

            if ($record->exists) {
                $record->delete();
            }

            return $duplicate;
        }

        $record->resolved_phone = $normalizedPhone;
        $record->phone = $normalizedPhone;
        $record->is_unresolved_lid = false;
        $record->last_synced_at = $timestamp;
        $record->meta_data = $this->mergeMetaData($record->meta_data, [
            'resolved_at' => $timestamp->toISOString(),
        ]);

        return $record;
    }

    private function extractLid(mixed $value): ?string
    {
        if (!is_scalar($value)) {
            return null;
        }

        $raw = trim((string) $value);
        if ($raw === '') {
            return null;
        }

        if (!str_contains(strtolower($raw), '@lid') && !preg_match('/^\d+$/', $raw)) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', explode('@', $raw)[0] ?? '') ?: '';
        return $digits !== '' ? $digits : null;
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', trim($phone)) ?: '';
    }

    private function earliestDate(mixed $left, mixed $right): mixed
    {
        if (!$left) {
            return $right;
        }

        if (!$right) {
            return $left;
        }

        return $left <= $right ? $left : $right;
    }

    private function cleanText(mixed $value): ?string
    {
        $value = is_string($value) ? trim($value) : '';
        return $value !== '' ? $value : null;
    }

    private function extractResolvedPhoneFromIdentifiers(array $payload, ?string $fallbackPhone = null): ?string
    {
        $candidates = [
            $payload['participant_pn'] ?? null,
            $payload['sender_pn'] ?? null,
            $payload['phone'] ?? null,
            $payload['resolved_phone'] ?? null,
            $payload['sender'] ?? null,
            $payload['author'] ?? null,
            $payload['participant'] ?? null,
            $payload['remote_jid'] ?? null,
            $fallbackPhone,
        ];

        foreach ($candidates as $candidate) {
            $normalized = $this->normalizePhone((string) ($candidate ?? ''));
            if ($normalized !== '' && strlen($normalized) <= 13) {
                return $normalized;
            }
        }

        return null;
    }

    private function extractAllLidsFromIdentifiers(array $payload): array
    {
        $candidates = [
            $payload['lid'] ?? null,
            $payload['participant'] ?? null,
            $payload['remote_jid'] ?? null,
            $payload['author'] ?? null,
            $payload['sender'] ?? null,
            $payload['participant_jid'] ?? null,
        ];

        $lids = [];
        foreach ($candidates as $candidate) {
            $lid = $this->extractLid($candidate);
            if ($lid) {
                $lids[] = $lid;
            }
        }

        return array_values(array_unique($lids));
    }

    private function sanitizeIdentifierPayload(array $payload): array
    {
        $allowed = [
            'participant_jid',
            'participant',
            'participant_pn',
            'remote_jid',
            'sender',
            'sender_pn',
            'author',
            'lid',
            'phone',
            'resolved_phone',
            'message_id',
        ];

        $sanitized = [];
        foreach ($allowed as $key) {
            if (!array_key_exists($key, $payload)) {
                continue;
            }

            $value = is_scalar($payload[$key]) ? trim((string) $payload[$key]) : null;
            if ($value !== null && $value !== '') {
                $sanitized[$key] = $value;
            }
        }

        return $sanitized;
    }

    private function mergeMetaData(mixed $existing, array $append): array
    {
        $base = is_array($existing) ? $existing : [];

        foreach ($append as $key => $value) {
            if ($value === null) {
                continue;
            }

            if (is_array($value) && isset($base[$key]) && is_array($base[$key])) {
                $isList = array_is_list($value) && array_is_list($base[$key]);
                if ($isList) {
                    $base[$key] = array_values(array_unique(array_filter(array_merge(
                        $base[$key],
                        $value
                    ))));
                } else {
                    $base[$key] = array_merge($base[$key], $value);
                }
                continue;
            }

            $base[$key] = $value;
        }

        return $base;
    }
}
