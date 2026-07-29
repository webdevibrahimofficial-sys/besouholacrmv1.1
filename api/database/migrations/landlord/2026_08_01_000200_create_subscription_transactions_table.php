<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('landlord')->create('subscription_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('contract_id')->nullable()->constrained('tenant_subscription_contracts')->nullOnDelete();
            $table->string('type');
            $table->string('status')->default('paid');
            $table->string('currency', 3);
            $table->decimal('total_amount', 12, 2);
            $table->string('payment_method')->nullable();
            $table->string('source')->default('manual');
            $table->string('gateway_provider')->nullable();
            $table->string('gateway_reference')->nullable();
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();
            $table->text('notes')->nullable();
            $table->string('attachment_path')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'created_at']);
            $table->index(['status', 'currency']);
        });
    }

    public function down(): void
    {
        Schema::connection('landlord')->dropIfExists('subscription_transactions');
    }
};
