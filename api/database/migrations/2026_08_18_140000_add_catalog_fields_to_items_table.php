<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            if (! Schema::hasColumn('items', 'model')) {
                $table->string('model')->nullable();
            }
            if (! Schema::hasColumn('items', 'barcode')) {
                $table->string('barcode')->nullable();
            }
            if (! Schema::hasColumn('items', 'tax_rate')) {
                $table->decimal('tax_rate', 8, 2)->nullable();
            }
            if (! Schema::hasColumn('items', 'tax_included')) {
                $table->boolean('tax_included')->default(false);
            }
            if (! Schema::hasColumn('items', 'notes')) {
                $table->text('notes')->nullable();
            }
            if (! Schema::hasColumn('items', 'service_type')) {
                $table->string('service_type')->nullable();
            }
            if (! Schema::hasColumn('items', 'service_duration')) {
                $table->string('service_duration')->nullable();
            }
            if (! Schema::hasColumn('items', 'service_start_date')) {
                $table->date('service_start_date')->nullable();
            }
            if (! Schema::hasColumn('items', 'service_end_date')) {
                $table->date('service_end_date')->nullable();
            }
            if (! Schema::hasColumn('items', 'renewal_required')) {
                $table->boolean('renewal_required')->default(false);
            }
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $columns = [
                'model', 'barcode', 'tax_rate', 'tax_included', 'notes',
                'service_type', 'service_duration', 'service_start_date', 'service_end_date', 'renewal_required',
            ];
            $existing = array_values(array_filter($columns, fn ($column) => Schema::hasColumn('items', $column)));
            if ($existing !== []) {
                $table->dropColumn($existing);
            }
        });
    }
};
