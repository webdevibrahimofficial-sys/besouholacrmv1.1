<?php

namespace App\Providers;

use App\Models\Feature;
use App\Services\AiCopilot\AiCopilotChatService;
use App\Services\AiCopilot\CopilotFinancialDecisionGate;
use App\Services\FinancialDecision\Adapters\FinancialInputAdapter;
use App\Services\FinancialDecision\Adapters\RealEstateAdapter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\ServiceProvider;

class FinancialDecisionServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(AiCopilotChatService::class, CopilotFinancialDecisionGate::class);
        $this->app->bind(FinancialInputAdapter::class, RealEstateAdapter::class);
    }

    public function boot(): void
    {
        $this->loadRoutesFrom(base_path('routes/financial-decision.php'));
        $this->ensureFeatureCatalog();
    }

    private function ensureFeatureCatalog(): void
    {
        try {
            if (! Schema::connection('landlord')->hasTable('features')) {
                return;
            }

            Feature::query()->firstOrCreate(
                ['key' => 'financial_decision_engine'],
                [
                    'name' => 'Financial Decision Engine',
                    'description' => 'Evaluate commercial offers with NPV, policy, and a backend-owned decision inside Copilot.',
                    'is_active' => true,
                ]
            );
        } catch (\Throwable) {
            // Schema may be unavailable while migrations are running.
        }
    }
}
