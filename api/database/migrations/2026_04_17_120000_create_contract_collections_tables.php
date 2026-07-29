<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('cc_customers')) {
            Schema::create('cc_customers', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->onDelete('cascade');
                $table->foreignId('lead_id')->nullable()->constrained('leads')->nullOnDelete();
                $table->foreignId('project_id')->nullable()->constrained('projects')->nullOnDelete();
                $table->foreignId('sales_owner_id')->nullable()->constrained('users')->nullOnDelete();
                $table->string('name');
                $table->string('phone')->nullable();
                $table->string('email')->nullable();
                $table->string('source')->nullable();
                $table->text('last_comments')->nullable();
                $table->json('meta_data')->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'phone'], 'cc_cust_t_phone_idx');
                $table->index(['tenant_id', 'lead_id'], 'cc_cust_t_lead_idx');
            });
        }

        if (!Schema::hasTable('cc_customer_units')) {
            Schema::create('cc_customer_units', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->onDelete('cascade');
                $table->foreignId('customer_id')->constrained('cc_customers')->onDelete('cascade');
                $table->foreignId('property_id')->constrained('properties')->onDelete('cascade');
                $table->string('status')->default('reserved'); // reserved | contracted
                $table->timestamp('reserved_at')->nullable();
                $table->timestamp('contracted_at')->nullable();
                $table->json('meta_data')->nullable();
                $table->timestamps();

                $table->unique(['tenant_id', 'customer_id', 'property_id'], 'cc_cu_t_c_p_uq');
                $table->index(['tenant_id', 'property_id'], 'cc_cu_t_prop_idx');
            });
        }

        if (!Schema::hasTable('cc_payment_plan_versions')) {
            Schema::create('cc_payment_plan_versions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->onDelete('cascade');
                $table->foreignId('customer_unit_id')->constrained('cc_customer_units')->onDelete('cascade');
                $table->unsignedInteger('version')->default(1);
                $table->boolean('is_active')->default(true);

                $table->decimal('reservation_amount', 15, 2)->default(0);
                $table->decimal('down_payment', 15, 2)->default(0);
                $table->decimal('delivery_payment', 15, 2)->default(0);
                $table->string('installment_type')->nullable(); // monthly | quarterly | half-yearly | yearly
                $table->unsignedInteger('installment_count')->default(0);
                $table->decimal('installment_value', 15, 2)->default(0);

                $table->json('meta_data')->nullable();
                $table->timestamps();

                $table->unique(['tenant_id', 'customer_unit_id', 'version'], 'cc_ppv_t_cu_v_uq');
                $table->index(['tenant_id', 'customer_unit_id', 'is_active'], 'cc_ppv_t_cu_act_idx');
            });
        }

        if (!Schema::hasTable('cc_contracts')) {
            Schema::create('cc_contracts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->onDelete('cascade');
                $table->foreignId('customer_id')->constrained('cc_customers')->onDelete('cascade');
                $table->foreignId('customer_unit_id')->nullable()->constrained('cc_customer_units')->nullOnDelete();
                $table->foreignId('property_id')->constrained('properties')->onDelete('cascade');

                $table->string('contract_number')->nullable();
                $table->date('contract_date')->nullable();
                $table->date('first_due_date')->nullable();
                $table->decimal('total_price', 15, 2)->default(0);

                // Immutable snapshot taken at contract creation
                $table->json('payment_plan_snapshot')->nullable();

                $table->string('status')->default('active'); // active | cancelled
                $table->json('meta_data')->nullable();
                $table->timestamps();

                // One Unit = One Contract (per tenant)
                $table->unique(['tenant_id', 'property_id'], 'cc_con_t_prop_uq');
                $table->index(['tenant_id', 'customer_id'], 'cc_con_t_cust_idx');
            });
        }

        if (!Schema::hasTable('cc_installments')) {
            Schema::create('cc_installments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->onDelete('cascade');
                $table->foreignId('contract_id')->constrained('cc_contracts')->onDelete('cascade');
                $table->unsignedInteger('installment_number');
                $table->date('due_date');
                $table->decimal('amount', 15, 2)->default(0);
                $table->decimal('paid_amount', 15, 2)->default(0);
                $table->string('status')->default('pending'); // pending | paid | overdue | partial | unpaid | rejected
                $table->json('meta_data')->nullable();
                $table->timestamps();

                $table->unique(['tenant_id', 'contract_id', 'installment_number'], 'cc_inst_t_con_no_uq');
                $table->index(['tenant_id', 'due_date', 'status'], 'cc_inst_t_due_stat_idx');
            });
        }

        if (!Schema::hasTable('cc_payments')) {
            Schema::create('cc_payments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->onDelete('cascade');
                $table->foreignId('customer_id')->constrained('cc_customers')->onDelete('cascade');
                $table->foreignId('contract_id')->constrained('cc_contracts')->onDelete('cascade');
                $table->decimal('amount', 15, 2)->default(0);
                $table->string('payment_method')->nullable(); // cash | check | bank_transfer
                $table->date('payment_date')->nullable();
                $table->string('reference_number')->nullable();
                $table->string('status')->default('posted'); // posted | rejected
                $table->text('notes')->nullable();
                $table->json('meta_data')->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'contract_id', 'payment_date'], 'cc_pay_t_con_date_idx');
            });
        }

        if (!Schema::hasTable('cc_payment_allocations')) {
            Schema::create('cc_payment_allocations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->onDelete('cascade');
                $table->foreignId('payment_id')->constrained('cc_payments')->onDelete('cascade');
                $table->foreignId('installment_id')->constrained('cc_installments')->onDelete('cascade');
                $table->decimal('amount_applied', 15, 2)->default(0);
                $table->json('meta_data')->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'installment_id'], 'cc_alloc_t_inst_idx');
            });
        }

        if (!Schema::hasTable('cc_comments')) {
            Schema::create('cc_comments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->onDelete('cascade');
                $table->string('related_type'); // customer | contract
                $table->unsignedBigInteger('related_id');
                $table->text('comment');
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['tenant_id', 'related_type', 'related_id'], 'cc_com_t_rel_idx');
            });
        }

        if (!Schema::hasTable('cc_attachments')) {
            Schema::create('cc_attachments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->onDelete('cascade');
                $table->string('related_type'); // contract | payment | customer
                $table->unsignedBigInteger('related_id');
                $table->string('file_path');
                $table->string('file_type')->nullable();
                $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
                $table->json('meta_data')->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'related_type', 'related_id'], 'cc_att_t_rel_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('cc_attachments');
        Schema::dropIfExists('cc_comments');
        Schema::dropIfExists('cc_payment_allocations');
        Schema::dropIfExists('cc_payments');
        Schema::dropIfExists('cc_installments');
        Schema::dropIfExists('cc_contracts');
        Schema::dropIfExists('cc_payment_plan_versions');
        Schema::dropIfExists('cc_customer_units');
        Schema::dropIfExists('cc_customers');
    }
};
