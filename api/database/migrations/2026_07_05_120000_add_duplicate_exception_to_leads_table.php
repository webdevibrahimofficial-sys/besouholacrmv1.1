<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            // Marks a lead as explicitly excluded from duplicate detection.
            // Set when a lead is created via "Duplicate and assign as fresh".
            $table->boolean('is_duplicate_exception')->default(false)->after('meta_data');

            // Links the cloned lead back to the lead it was duplicated from.
            $table->unsignedBigInteger('original_lead_id')->nullable()->after('is_duplicate_exception');

            $table->index('is_duplicate_exception');
            $table->index('original_lead_id');
        });
    }

    public function down(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            $table->dropIndex(['leads_is_duplicate_exception_index']);
            $table->dropIndex(['leads_original_lead_id_index']);
            $table->dropColumn(['is_duplicate_exception', 'original_lead_id']);
        });
    }
};
