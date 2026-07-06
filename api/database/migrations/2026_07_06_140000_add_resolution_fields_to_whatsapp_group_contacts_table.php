<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('whatsapp_group_contacts', function (Blueprint $table) {
            $table->string('lid', 64)->nullable()->after('participant_jid')->index();
            $table->string('resolved_phone', 32)->nullable()->after('phone')->index();
            $table->boolean('is_unresolved_lid')->default(false)->after('resolved_phone')->index();
        });

        DB::table('whatsapp_group_contacts')
            ->select(['id', 'participant_jid', 'phone', 'resolved_phone', 'is_unresolved_lid'])
            ->orderBy('id')
            ->chunkById(500, function ($rows) {
                foreach ($rows as $row) {
                    $participantJid = trim((string) ($row->participant_jid ?? ''));
                    $phone = preg_replace('/\D+/', '', (string) ($row->phone ?? '')) ?: '';

                    $isLid = $participantJid !== '' && str_ends_with(strtolower($participantJid), '@lid');
                    $lid = null;

                    if ($isLid) {
                        $lid = preg_replace('/\D+/', '', explode('@', $participantJid)[0] ?? '') ?: null;
                    }

                    DB::table('whatsapp_group_contacts')
                        ->where('id', $row->id)
                        ->update([
                            'lid' => $lid,
                            'resolved_phone' => $isLid ? null : ($phone !== '' ? $phone : null),
                            'is_unresolved_lid' => $isLid && $phone !== '' && $lid !== null && $phone === $lid,
                        ]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('whatsapp_group_contacts', function (Blueprint $table) {
            $table->dropColumn(['lid', 'resolved_phone', 'is_unresolved_lid']);
        });
    }
};
