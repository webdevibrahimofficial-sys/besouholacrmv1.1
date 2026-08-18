<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_request_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();
            $table->foreignId('item_id')->nullable()->constrained('items')->nullOnDelete();
            $table->foreignId('category_id')->nullable()->constrained('item_categories')->nullOnDelete();
            $table->string('item_type')->nullable();
            $table->string('item_name_snapshot');
            $table->decimal('quantity', 15, 2)->default(1);
            $table->decimal('unit_price', 15, 2)->default(0);
            $table->decimal('line_subtotal', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->decimal('tax_amount', 15, 2)->default(0);
            $table->decimal('line_total', 15, 2)->default(0);
            $table->string('billing_type')->nullable();
            $table->json('meta_data')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'order_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_request_items');
    }
};
