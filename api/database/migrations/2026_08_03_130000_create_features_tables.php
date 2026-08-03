<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Independent Feature Flags system.
 *
 * IMPORTANT: This is intentionally SEPARATE from the existing "Modules"
 * system (modules / tenant_modules tables, App\Models\Module,
 * App\Services\ModuleService, App\Services\TenantService::syncTenantModules).
 *
 * Modules represent subscription-plan bundles and get fully re-synced
 * (sync(), which detaches anything not in the computed list) whenever a
 * tenant's plan or company_type changes. Features represent independent,
 * manually-toggled capabilities (e.g. "besouhola_copilot") that must NOT be
 * tied to a subscription plan and must survive plan/company_type changes
 * untouched. Do not merge these two systems.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Compatibility stub: landlord-owned feature tables now live under database/migrations/landlord.
    }

    public function down(): void
    {
        // Compatibility stub.
    }
};
