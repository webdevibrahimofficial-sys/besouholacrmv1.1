<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('contract_templates', function (Blueprint $table) {
            if (!Schema::hasColumn('contract_templates', 'content_type')) {
                $table->string('content_type')->default('html')->after('name'); // html|pdf
            }
            if (!Schema::hasColumn('contract_templates', 'pdf_path')) {
                $table->string('pdf_path')->nullable()->after('body'); // public disk path
            }
            if (!Schema::hasColumn('contract_templates', 'pdf_original_name')) {
                $table->string('pdf_original_name')->nullable()->after('pdf_path');
            }
        });
    }

    public function down(): void
    {
        Schema::table('contract_templates', function (Blueprint $table) {
            if (Schema::hasColumn('contract_templates', 'pdf_original_name')) {
                $table->dropColumn('pdf_original_name');
            }
            if (Schema::hasColumn('contract_templates', 'pdf_path')) {
                $table->dropColumn('pdf_path');
            }
            if (Schema::hasColumn('contract_templates', 'content_type')) {
                $table->dropColumn('content_type');
            }
        });
    }
};

