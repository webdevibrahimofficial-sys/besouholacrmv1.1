<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            if (!Schema::hasColumn('properties', 'project_id')) {
                $table->unsignedBigInteger('project_id')->nullable()->index()->after('tenant_id');
            }
        });

        // Backfill project_id from legacy "project" (name) field when possible.
        if (Schema::hasColumn('properties', 'project') && Schema::hasColumn('properties', 'tenant_id')) {
            $projectRows = DB::table('projects')->select('id', 'tenant_id', 'name')->get();
            $map = [];
            $norm = function ($s) {
                $s = trim((string) $s);
                if ($s === '') return '';
                $s = preg_replace('/\s+/u', ' ', $s);
                return strtolower($s);
            };

            foreach ($projectRows as $r) {
                $tenantId = (string) ($r->tenant_id ?? '');
                $name = $norm($r->name ?? '');
                if ($tenantId === '' || $name === '') continue;
                $map[$tenantId][$name] = (int) $r->id;
            }

            DB::table('properties')
                ->select('id', 'tenant_id', 'project')
                ->whereNull('project_id')
                ->whereNotNull('project')
                ->orderBy('id')
                ->chunkById(500, function ($rows) use ($map, $norm) {
                    foreach ($rows as $row) {
                        $tenantId = (string) ($row->tenant_id ?? '');
                        $name = $norm($row->project ?? '');
                        if ($tenantId === '' || $name === '') continue;
                        $pid = $map[$tenantId][$name] ?? null;
                        if (!$pid) continue;
                        DB::table('properties')->where('id', $row->id)->update(['project_id' => $pid]);
                    }
                });
        }
    }

    public function down(): void
    {
        Schema::table('properties', function (Blueprint $table) {
            if (Schema::hasColumn('properties', 'project_id')) {
                $table->dropIndex(['project_id']);
                $table->dropColumn('project_id');
            }
        });
    }
};
