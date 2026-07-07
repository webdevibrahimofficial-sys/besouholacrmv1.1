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
            if (!Schema::hasColumn('whatsapp_group_contacts', 'lid')) {
                $table->string('lid', 64)->nullable()->after('participant_jid');
            }

            if (!Schema::hasColumn('whatsapp_group_contacts', 'resolved_phone')) {
                $table->string('resolved_phone', 32)->nullable()->after('phone');
            }

            if (!Schema::hasColumn('whatsapp_group_contacts', 'is_unresolved_lid')) {
                $table->boolean('is_unresolved_lid')->default(false)->after('resolved_phone');
            }
        });

        $this->ensureIndex('whatsapp_group_contacts', 'lid', 'whatsapp_group_contacts_lid_index');
        $this->ensureIndex('whatsapp_group_contacts', 'resolved_phone', 'whatsapp_group_contacts_resolved_phone_index');
        $this->ensureIndex('whatsapp_group_contacts', 'is_unresolved_lid', 'whatsapp_group_contacts_is_unresolved_lid_index');

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
            if ($this->hasIndex('whatsapp_group_contacts', 'whatsapp_group_contacts_lid_index')) {
                $table->dropIndex('whatsapp_group_contacts_lid_index');
            }

            if ($this->hasIndex('whatsapp_group_contacts', 'whatsapp_group_contacts_resolved_phone_index')) {
                $table->dropIndex('whatsapp_group_contacts_resolved_phone_index');
            }

            if ($this->hasIndex('whatsapp_group_contacts', 'whatsapp_group_contacts_is_unresolved_lid_index')) {
                $table->dropIndex('whatsapp_group_contacts_is_unresolved_lid_index');
            }

            $columnsToDrop = array_values(array_filter([
                Schema::hasColumn('whatsapp_group_contacts', 'lid') ? 'lid' : null,
                Schema::hasColumn('whatsapp_group_contacts', 'resolved_phone') ? 'resolved_phone' : null,
                Schema::hasColumn('whatsapp_group_contacts', 'is_unresolved_lid') ? 'is_unresolved_lid' : null,
            ]));

            if (!empty($columnsToDrop)) {
                $table->dropColumn($columnsToDrop);
            }
        });
    }

    private function ensureIndex(string $tableName, string $column, string $indexName): void
    {
        if (!Schema::hasColumn($tableName, $column) || $this->hasIndex($tableName, $indexName)) {
            return;
        }

        Schema::table($tableName, function (Blueprint $table) use ($column, $indexName) {
            $table->index($column, $indexName);
        });
    }

    private function hasIndex(string $tableName, string $indexName): bool
    {
        return DB::table('information_schema.statistics')
            ->where('table_schema', DB::getDatabaseName())
            ->where('table_name', $tableName)
            ->where('index_name', $indexName)
            ->exists();
    }
};
