<?php

namespace App\Services\Whatsapp;

use App\Models\WhatsappContact;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

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
                // Race with another upsert that claimed the same lid/phone unique
                // key between our lookup and save. Re-resolve and merge instead
                // of bubbling up a 500.
                $conflicting = $this->findMatchingRecord($tenantId, $lid, $phone, $jid);
                if ($conflicting && $conflicting->id !== $record->id) {
                    $conflicting->jid = $jid ?? $conflicting->jid;
                    $conflicting->lid = $lid ?? $conflicting->lid;
                    if ($phone !== '') {
                        $conflicting->phone = $phone;
                    }
                    $conflicting->name = $name ?? $conflicting->name;
                    $conflicting->push_name = $pushName ?? $conflicting->push_name;
                    $conflicting->verified_name = $verifiedName ?? $conflicting->verified_name;
                    $conflicting->raw = $this->mergeRaw($conflicting->raw, $data);
                    $conflicting->last_seen_at = $timestamp;
                    $conflicting->save();
                    return $conflicting;
                }

                throw $e;
            }

            return $record;
        });
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

        return $contact?->phone ?: null;
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

        if (!str_contains(strtolower($raw), '@lid')) {
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
}
