<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('whatsapp_contacts')
            ->orderBy('id')
            ->chunkById(500, function ($rows) {
                foreach ($rows as $row) {
                    $lid = $this->digits($row->lid ?? null);
                    $phone = $this->digits($row->phone ?? null);

                    if ($phone === '' || !$this->looksLikeLid($phone)) {
                        continue;
                    }

                    if ($lid !== '' && $phone !== $lid) {
                        continue;
                    }

                    DB::table('whatsapp_contacts')
                        ->where('id', $row->id)
                        ->update(['phone' => null]);
                }
            });

        DB::table('whatsapp_group_contacts')
            ->orderBy('id')
            ->chunkById(500, function ($rows) {
                foreach ($rows as $row) {
                    $derivedLid = $this->digits($row->lid ?? null);
                    if ($derivedLid === '') {
                        $participantJid = trim((string) ($row->participant_jid ?? ''));
                        if (str_ends_with(strtolower($participantJid), '@lid')) {
                            $derivedLid = $this->digits(explode('@', $participantJid)[0] ?? null);
                        }
                    }

                    $phone = $this->digits($row->phone ?? null);
                    $resolvedPhone = $this->digits($row->resolved_phone ?? null);
                    $phoneLooksPoisoned = $phone !== '' && $this->looksLikeLid($phone) && ($derivedLid === '' || $phone === $derivedLid);
                    $resolvedLooksPoisoned = $resolvedPhone !== '' && $this->looksLikeLid($resolvedPhone) && ($derivedLid === '' || $resolvedPhone === $derivedLid);

                    if (!$phoneLooksPoisoned && !$resolvedLooksPoisoned) {
                        continue;
                    }

                    $update = [
                        'is_unresolved_lid' => true,
                        'resolved_phone' => null,
                    ];

                    if ($derivedLid !== '') {
                        $update['lid'] = $derivedLid;
                        $update['phone'] = $derivedLid;
                    }

                    if (($row->converted_lead_id ?? null) === null) {
                        $update['status'] = 'pending';
                    }

                    DB::table('whatsapp_group_contacts')
                        ->where('id', $row->id)
                        ->update($update);
                }
            });
    }

    public function down(): void
    {
    }

    private function digits(mixed $value): string
    {
        return preg_replace('/\D+/', '', (string) ($value ?? '')) ?: '';
    }

    private function looksLikeLid(string $digits): bool
    {
        return $digits !== '' && strlen($digits) >= 14;
    }
};
