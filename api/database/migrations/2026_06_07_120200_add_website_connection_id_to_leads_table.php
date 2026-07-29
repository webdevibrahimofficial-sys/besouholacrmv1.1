<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('leads', 'website_connection_id')) {
            return;
        }

        $afterColumn = Schema::hasColumn('leads', 'meta_data') ? 'meta_data' : null;

        Schema::table('leads', function (Blueprint $table) use ($afterColumn) {
            $column = $table->unsignedBigInteger('website_connection_id')->nullable();

            if ($afterColumn) {
                $column->after($afterColumn);
            }

            $table->foreign('website_connection_id')
                ->references('id')
                ->on('website_connections')
                ->nullOnDelete();

            $table->index('website_connection_id');
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('leads', 'website_connection_id')) {
            return;
        }

        Schema::table('leads', function (Blueprint $table) {
            $table->dropForeign(['website_connection_id']);
            $table->dropIndex(['website_connection_id']);
            $table->dropColumn('website_connection_id');
        });
    }
};
