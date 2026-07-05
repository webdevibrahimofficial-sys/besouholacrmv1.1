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

        foreach ($contacts as $contact) {
            $normalizedPhone = $this->normalizePhone((string) ($contact['phone'] ?? ''));
            $groupJid = trim((string) ($contact['group_jid'] ?? ''));

            if ($tenantId <= 0 || $normalizedPhone === '' || $groupJid === '') {
                $skipped++;
                continue;
            }

            $record = WhatsappGroupContact::query()->firstOrNew([
                'tenant_id' => $tenantId,
                'group_jid' => $groupJid,
                'phone' => $normalizedPhone,
            ]);

            $isNew = !$record->exists;

            if ($isNew && !$record->first_seen_at) {
                $record->first_seen_at = $timestamp;
            }

            $record->group_name = $this->cleanText($contact['group_name'] ?? null) ?? $record->group_name;
            $record->participant_jid = $this->cleanText($contact['participant_jid'] ?? null) ?? $record->participant_jid;
            $record->push_name = $this->cleanText($contact['push_name'] ?? null) ?? $record->push_name;
            $record->last_synced_at = $timestamp;

            if (!$record->converted_lead_id) {
                $record->status = 'pending';
            }

            $record->save();

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
        ];
    }

    public function markPhoneAsConverted(int $tenantId, string $phone, int $leadId): int
    {
        $normalizedPhone = $this->normalizePhone($phone);
        if ($tenantId <= 0 || $leadId <= 0 || $normalizedPhone === '') {
            return 0;
        }

        return WhatsappGroupContact::query()
            ->where('tenant_id', $tenantId)
            ->where('phone', $normalizedPhone)
            ->update([
                'status' => 'converted',
                'converted_lead_id' => $leadId,
                'last_synced_at' => now(),
            ]);
    }

    private function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', trim($phone)) ?: '';
    }

    private function cleanText(mixed $value): ?string
    {
        $value = is_string($value) ? trim($value) : '';
        return $value !== '' ? $value : null;
    }
}
