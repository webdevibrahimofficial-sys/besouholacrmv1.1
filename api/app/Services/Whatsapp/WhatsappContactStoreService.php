<?php

namespace App\Services\Whatsapp;

use App\Models\WhatsappContact;
use App\Models\WhatsappMessage;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The "Contact Resolver Layer" described in the WhatsApp-Web-parity plan:
 * a persistent, tenant-scoped cache of every jid/lid/phone/name combination
 * ever observed for a session (from contacts.upsert/update, message events,
 * history sync, or group participant snapshots).
 *
 * Anything that needs to turn a LID into a real phone number should consult
 * this store *before* falling back to a live WhatsApp lookup or giving up
 * and marking the contact unresolved.
 */
class WhatsappContactStoreService
{
    /**
     * Upsert a single contact observation. Safe to call repeatedly with
     * partial data (e.g. only a lid+jid from a group snapshot, later
     * enriched with a phone from a message event).
     */
    public function upsertContact(int $tenantId, array $data, ?CarbonInterface $seenAt = null): ?WhatsappContact
    {
        if ($tenantId <= 0) {
            return null;
        }

        $timestamp = $seenAt ?: now();

        $jid = $this->cleanText($data['jid'] ?? null);
        $lid = $this->extractLid($data['lid'] ?? null) ?? $this->extractLid($jid);
        $phone = $this->normalizePhone((string) ($data['phone'] ?? ''));
        $name = $this->cleanText($data['name'] ?? null);
        $pushName = $this->cleanText($data['push_name'] ?? $data['pushName'] ?? null);
        $verifiedName = $this->cleanText($data['verified_name'] ?? $data['verifiedName'] ?? null);
        $sessionId = $this->cleanText($data['session_id'] ?? null);

        // A bare jid that isn't a group/lid/broadcast jid is itself a phone number.
        if ($phone === '' && $jid && !str_contains($jid, '@lid') && !str_contains($jid, '@g.us') && !str_contains($jid, '@broadcast')) {
            $phone = $this->normalizePhone($jid);
        }

        // Defense in depth: never let a value that *looks like* a LID (14+ digits,
        // or literally equal to the lid we're storing alongside it) be recorded as
        // a real phone number. A caller bug upstream storing the LID as a
        // "resolved" phone is exactly the kind of data corruption this guard exists
        // to stop, since a poisoned row here gets treated as resolved everywhere
        // this store is consulted (future syncs, other groups, message events).
        if ($phone !== '' && ($this->looksLikeLid($phone) || ($lid !== null && $phone === $lid))) {
            $phone = '';
        }

        if ($lid === null && $phone === '' && $jid === null) {
            return null;
        }

        return DB::transaction(function () use (
            $tenantId,
            $sessionId,
            $jid,
            $lid,
            $phone,
            $name,
            $pushName,
            $verifiedName,
            $timestamp,
            $data
        ) {
            $record = $this->findMatchingRecord($tenantId, $lid, $phone, $jid);

            if (!$record) {
                $record = new WhatsappContact(['tenant_id' => $tenantId]);
            }

            $record->session_id = $sessionId ?? $record->session_id;
            $record->jid = $jid ?? $record->jid;
            $record->lid = $lid ?? $record->lid;
            // Never overwrite a previously-known real phone with an empty value,
            // but do allow a real phone to replace nothing.
            if ($phone !== '') {
                $record->phone = $phone;
            }
            $record->name = $name ?? $record->name;
            $record->push_name = $pushName ?? $record->push_name;
            $record->verified_name = $verifiedName ?? $record->verified_name;
            $record->raw = $this->mergeRaw($record->raw, $data);
            $record->last_seen_at = $timestamp;

            try {
                $record->save();
            } catch (\Illuminate\Database\QueryException $e) {
                // Genuine duplicate: the same real-world contact already has
                // MORE THAN ONE row in this table (e.g. one row created from a
                // lid-only observation, a separate row created from a
                // phone-only observation, before both identifiers were ever
                // seen together). Resolving just one conflict at a time isn't
                // enough -- fixing the lid collision can immediately trigger a
                // phone collision against a third row. Gather every existing
                // row that shares either identifier, merge them all into one
                // canonical row, and delete the rest.
                $merged = $this->consolidateDuplicates($tenantId, $record, $lid, $phone, $jid, $data, $timestamp);

                if (!$merged) {
                    throw $e;
                }

                return $merged;
            }

            return $record;
        });
    }

    /**
     * Recover from a (tenant_id, lid) or (tenant_id, phone) unique
     * constraint violation on upsertContact()'s save(). Collects every
     * existing row sharing $lid or $phone (plus $record itself, if it
     * already existed), merges them into the lowest-id row, deletes the
     * rest, then applies this call's freshly observed data and saves once
     * more. Because every row that could collide on either unique key has
     * been consolidated first, this final save cannot hit the same
     * violation again.
     */
    private function consolidateDuplicates(
        int $tenantId,
        WhatsappContact $record,
        ?string $lid,
        string $phone,
        ?string $jid,
        array $data,
        CarbonInterface $timestamp
    ): ?WhatsappContact {
        $existing = collect();

        if ($record->exists) {
            $existing->push($record);
        }

        if ($lid) {
            $existing = $existing->merge(
                WhatsappContact::query()->where('tenant_id', $tenantId)->where('lid', $lid)->get()
            );
        }

        if ($phone !== '') {
            $existing = $existing->merge(
                WhatsappContact::query()->where('tenant_id', $tenantId)->where('phone', $phone)->get()
            );
        }

        $existing = $existing->unique('id')->sortBy('id')->values();

        if ($existing->isEmpty()) {
            return null;
        }

        // Keep the oldest row (lowest id) as the canonical survivor.
        $primary = $existing->first();

        foreach ($existing->skip(1) as $duplicate) {
            $primary->jid = $primary->jid ?? $duplicate->jid;
            $primary->lid = $primary->lid ?? $duplicate->lid;
            $primary->phone = $primary->phone ?? $duplicate->phone;
            $primary->name = $primary->name ?? $duplicate->name;
            $primary->push_name = $primary->push_name ?? $duplicate->push_name;
            $primary->verified_name = $primary->verified_name ?? $duplicate->verified_name;
            $primary->raw = $this->mergeRaw($primary->raw, is_array($duplicate->raw) ? $duplicate->raw : []);
            $duplicate->delete();
        }

        // Apply this call's freshly observed data on top of the merged row.
        $primary->jid = $jid ?? $primary->jid;
        $primary->lid = $lid ?? $primary->lid;
        if ($phone !== '') {
            $primary->phone = $phone;
        }
        $primary->name = $this->cleanText($data['name'] ?? null) ?? $primary->name;
        $primary->push_name = $this->cleanText($data['push_name'] ?? $data['pushName'] ?? null) ?? $primary->push_name;
        $primary->verified_name = $this->cleanText($data['verified_name'] ?? $data['verifiedName'] ?? null) ?? $primary->verified_name;
        $primary->raw = $this->mergeRaw($primary->raw, $data);
        $primary->last_seen_at = $timestamp;
        $primary->save();

        return $primary;
    }

    /**
     * Bulk variant for contacts.upsert / contacts.update batches, and for
     * group-participant snapshots.
     */
    public function upsertMany(int $tenantId, array $contacts, ?CarbonInterface $seenAt = null): int
    {
        $count = 0;

        foreach ($contacts as $contact) {
            if (!is_array($contact)) {
                continue;
            }

            if ($this->upsertContact($tenantId, $contact, $seenAt)) {
                $count++;
            }
        }

        return $count;
    }

    /**
     * Best-effort resolve: given a LID, return the real phone number if this
     * store has already learned it from any source.
     */
    public function resolvePhoneForLid(int $tenantId, ?string $lid): ?string
    {
        $normalizedLid = $this->extractLid($lid);
        if ($tenantId <= 0 || $normalizedLid === null) {
            return null;
        }

        $contact = WhatsappContact::query()
            ->where('tenant_id', $tenantId)
            ->where('lid', $normalizedLid)
            ->whereNotNull('phone')
            ->first();

        if (!$contact || !$contact->phone) {
            return null;
        }

        // Self-heal: an older bug could have poisoned this row with the LID
        // itself stored as "phone". Never hand that back out as if resolved --
        // and clear it here so it stops being returned on every future call.
        if ($this->looksLikeLid($contact->phone) || $contact->phone === $normalizedLid) {
            $contact->forceFill(['phone' => null])->save();
            return null;
        }

        return $contact->phone;
    }

    /**
     * Look back through persisted whatsapp_messages for a previously-seen
     * message involving this same LID and recover a real phone number from the
     * stored identifiers if possible.
     */
    public function resolveFromMessageHistory(int $tenantId, ?string $lid): ?string
    {
        $normalizedLid = $this->extractLid($lid);
        if ($tenantId <= 0 || $normalizedLid === null) {
            return null;
        }

        if (Schema::hasColumn('whatsapp_messages', 'counterpart_lid')) {
            $indexedMatch = WhatsappMessage::query()
                ->where('tenant_id', $tenantId)
                ->where('counterpart_lid', $normalizedLid)
                ->latest('id')
                ->first();

            $resolvedIndexedPhone = $this->extractPhoneFromStoredMessage($indexedMatch);
            if ($resolvedIndexedPhone && !$this->looksLikeLid($resolvedIndexedPhone) && $resolvedIndexedPhone !== $normalizedLid) {
                return $resolvedIndexedPhone;
            }
        }

        foreach (
            WhatsappMessage::query()
                ->where('tenant_id', $tenantId)
                ->whereNotNull('raw')
                ->orderByDesc('id')
                ->cursor() as $message
        ) {
            $raw = is_array($message->raw) ? $message->raw : [];
            if (!$this->messagePayloadContainsLid($raw, $normalizedLid)) {
                continue;
            }

            $resolvedPhone = $this->extractPhoneFromStoredMessage($message);
            if ($resolvedPhone && !$this->looksLikeLid($resolvedPhone) && $resolvedPhone !== $normalizedLid) {
                return $resolvedPhone;
            }
        }

        return null;
    }

    /**
     * Best-effort resolve a display name for any of the given identifiers
     * (jid, lid, or phone).
     */
    public function resolveNameForIdentifiers(int $tenantId, array $candidates): ?string
    {
        if ($tenantId <= 0) {
            return null;
        }

        $jids = [];
        $lids = [];
        $phones = [];

        foreach ($candidates as $candidate) {
            if (!is_scalar($candidate) || $candidate === '' || $candidate === null) {
                continue;
            }

            $jids[] = (string) $candidate;

            $lid = $this->extractLid($candidate);
            if ($lid) {
                $lids[] = $lid;
            }

            $phone = $this->normalizePhone((string) $candidate);
            if ($phone !== '') {
                $phones[] = $phone;
            }
        }

        if (empty($jids) && empty($lids) && empty($phones)) {
            return null;
        }

        $contact = WhatsappContact::query()
            ->where('tenant_id', $tenantId)
            ->where(function ($query) use ($jids, $lids, $phones) {
                if (!empty($jids)) {
                    $query->orWhereIn('jid', $jids);
                }
                if (!empty($lids)) {
                    $query->orWhereIn('lid', $lids);
                }
                if (!empty($phones)) {
                    $query->orWhereIn('phone', $phones);
                }
            })
            ->first();

        if (!$contact) {
            return null;
        }

        return $this->cleanText($contact->name)
            ?? $this->cleanText($contact->push_name)
            ?? $this->cleanText($contact->verified_name);
    }

    private function findMatchingRecord(int $tenantId, ?string $lid, string $phone, ?string $jid): ?WhatsappContact
    {
        if ($lid) {
            $byLid = WhatsappContact::query()
                ->where('tenant_id', $tenantId)
                ->where('lid', $lid)
                ->first();

            if ($byLid) {
                return $byLid;
            }
        }

        if ($phone !== '') {
            $byPhone = WhatsappContact::query()
                ->where('tenant_id', $tenantId)
                ->where('phone', $phone)
                ->first();

            if ($byPhone) {
                return $byPhone;
            }
        }

        if ($jid) {
            return WhatsappContact::query()
                ->where('tenant_id', $tenantId)
                ->where('jid', $jid)
                ->first();
        }

        return null;
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

        if (!str_contains(strtolower($raw), '@lid') && !preg_match('/^\d{14,}$/', $raw)) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', explode('@', $raw)[0] ?? '') ?: '';
        return $digits !== '' ? $digits : null;
    }

    private function normalizePhone(string $value): string
    {
        $raw = trim($value);
        if ($raw === '' || str_contains(strtolower($raw), '@lid')) {
            return '';
        }

        $userPart = explode('@', $raw)[0] ?? '';
        $userPart = explode(':', $userPart)[0] ?? '';
        $digits = preg_replace('/\D+/', '', $userPart) ?: '';

        if ($digits === '' || strlen($digits) < 7 || strlen($digits) > 15) {
            return '';
        }

        return $digits;
    }

    private function cleanText(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        return $trimmed !== '' ? $trimmed : null;
    }

    private function mergeRaw(mixed $existing, array $incoming): array
    {
        $base = is_array($existing) ? $existing : [];
        $allowed = ['jid', 'lid', 'phone', 'name', 'push_name', 'pushName', 'verified_name', 'verifiedName', 'source'];

        foreach ($allowed as $key) {
            if (array_key_exists($key, $incoming) && is_scalar($incoming[$key]) && $incoming[$key] !== '') {
                $base[$key] = $incoming[$key];
            }
        }

        $base['last_updated_at'] = now()->toISOString();

        return $base;
    }

    private function extractPhoneFromStoredMessage(?WhatsappMessage $message): ?string
    {
        if (!$message) {
            return null;
        }

        $raw = is_array($message->raw) ? $message->raw : [];
        $nestedMessage = is_array($raw['message'] ?? null) ? $raw['message'] : [];
        $direction = $nestedMessage['from_me'] ?? $raw['from_me'] ?? $message->direction ?? null;
        $isOutbound = in_array($direction, [true, 1, '1', 'outbound'], true);

        $candidates = [
            $nestedMessage['resolved_phone'] ?? null,
            $nestedMessage['participant_pn'] ?? null,
            $nestedMessage['sender_pn'] ?? null,
            $raw['resolved_phone'] ?? null,
            $raw['participant_pn'] ?? null,
            $raw['sender_pn'] ?? null,
            $nestedMessage['phone'] ?? null,
            $raw['phone'] ?? null,
            $isOutbound ? $message->to : $message->from,
            $message->from,
            $message->to,
        ];

        foreach ($candidates as $candidate) {
            $normalized = $this->normalizePhone((string) ($candidate ?? ''));
            if ($normalized !== '' && strlen($normalized) <= 13) {
                return $normalized;
            }
        }

        return null;
    }

    private function messagePayloadContainsLid(array $raw, string $lid): bool
    {
        $nestedMessage = is_array($raw['message'] ?? null) ? $raw['message'] : [];
        $candidates = [
            $raw['counterpart_lid'] ?? null,
            $nestedMessage['counterpart_lid'] ?? null,
            $raw['participant'] ?? null,
            $raw['remote_jid'] ?? null,
            $raw['sender'] ?? null,
            $raw['author'] ?? null,
            $raw['phone'] ?? null,
            $nestedMessage['participant'] ?? null,
            $nestedMessage['remote_jid'] ?? null,
            $nestedMessage['sender'] ?? null,
            $nestedMessage['author'] ?? null,
            $nestedMessage['phone'] ?? null,
        ];

        foreach ($candidates as $candidate) {
            if ($this->extractLid($candidate) === $lid) {
                return true;
            }
        }

        return false;
    }

    private function looksLikeLid(?string $value): bool
    {
        $digits = preg_replace('/\D+/', '', (string) ($value ?? '')) ?: '';
        return $digits !== '' && strlen($digits) >= 14;
    }
}
