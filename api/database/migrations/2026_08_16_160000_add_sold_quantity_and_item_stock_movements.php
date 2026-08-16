<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            if (!Schema::hasColumn('items', 'sold_quantity')) {
                $table->integer('sold_quantity')->default(0)->after('reserved_quantity');
            }
        });

        if (!Schema::hasTable('item_stock_movements')) {
            Schema::create('item_stock_movements', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('tenant_id')->nullable()->index();
                $table->unsignedBigInteger('item_id')->index();
                $table->unsignedInteger('quantity')->default(0);
                $table->string('from_state', 32);
                $table->string('to_state', 32);
                $table->string('source_type', 64)->nullable();
                $table->unsignedBigInteger('source_id')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('item_stock_movements');

        Schema::table('items', function (Blueprint $table) {
            if (Schema::hasColumn('items', 'sold_quantity')) {
                $table->dropColumn('sold_quantity');
            }
        });
    }
};
