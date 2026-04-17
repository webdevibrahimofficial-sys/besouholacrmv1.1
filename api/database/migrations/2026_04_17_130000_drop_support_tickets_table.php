<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Safety guard: do NOT drop by default.
        // Use `php artisan support:archive-tickets --and-drop` for controlled archival + drop,
        // or set DROP_SUPPORT_TABLES=true to allow this migration to drop the table.
        if (!filter_var(env('DROP_SUPPORT_TABLES', false), FILTER_VALIDATE_BOOLEAN)) {
            return;
        }

        Schema::dropIfExists('tickets');
    }

    public function down(): void
    {
        // No-op: we intentionally do not recreate the legacy Support schema.
    }
};

