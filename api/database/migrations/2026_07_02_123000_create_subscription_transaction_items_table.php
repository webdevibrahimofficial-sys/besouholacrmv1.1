<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('subscription_transaction_items')) {
            return;
        }

        Schema::create('subscription_transaction_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('transaction_id')->constrained('subscription_transactions')->cascadeOnDelete();
            $table->string('item_type');
            $table->string('item_code')->nullable();
            $table->string('label');
            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('unit_price', 12, 2);
            $table->decimal('amount', 12, 2);
            $table->timestamps();

            $table->index(['transaction_id', 'item_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_transaction_items');
    }
};
