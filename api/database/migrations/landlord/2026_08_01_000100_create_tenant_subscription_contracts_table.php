<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::connection('landlord')->create('tenant_subscription_contracts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('plan_code');
            $table->string('currency', 3);
            $table->string('billing_cycle');
            $table->decimal('agreed_amount', 12, 2);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'effective_from']);
            $table->index(['tenant_id', 'effective_to']);
        });
    }

    public function down(): void
    {
        Schema::connection('landlord')->dropIfExists('tenant_subscription_contracts');
    }
};
