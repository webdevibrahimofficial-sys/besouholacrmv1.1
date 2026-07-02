<?php

namespace App\Console\Commands;

use App\Models\SubscriptionPlan;
use App\Models\SubscriptionPlanPrice;
use App\Models\Tenant;
use App\Services\SubscriptionTransactionService;
use App\Services\TenantSubscriptionContractService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class BackfillSubscriptionLedger extends Command
{
    protected $signature = 'subscriptions:backfill-ledger {--dry-run : Preview without writing data}';

    protected $description = 'Backfill subscription contracts and transactions for existing tenants into the main database ledger.';

    public function __construct(
        private readonly TenantSubscriptionContractService $contractService,
        private readonly SubscriptionTransactionService $transactionService,
    ) {
        parent::__construct();
    }

    public function handle(): int
    {
        $isDryRun = (bool) $this->option('dry-run');

        $plans = SubscriptionPlan::query()->get()->keyBy('code');
        $prices = SubscriptionPlanPrice::query()
            ->get()
            ->groupBy(fn (SubscriptionPlanPrice $price) => $price->subscriptionPlan?->code);

        $tenants = Tenant::query()
            ->whereNull('archived_at')
            ->whereNotNull('subscription_plan')
            ->orderBy('id')
            ->get();

        $createdContracts = 0;
        $createdTransactions = 0;
        $skipped = 0;

        foreach ($tenants as $tenant) {
            if ($tenant->subscriptionTransactions()->exists()) {
                $skipped++;
                $this->line("Skipping tenant #{$tenant->id} ({$tenant->name}) because ledger entries already exist.");
                continue;
            }

            $planCode = (string) $tenant->subscription_plan;
            if (!$plans->has($planCode)) {
                $skipped++;
                $this->warn("Skipping tenant #{$tenant->id} ({$tenant->name}) because plan [{$planCode}] is not defined in subscription_plans.");
                continue;
            }

            $billingCycle = $this->guessBillingCycle($tenant);
            $priceRow = $prices->get($planCode)?->first(
                fn (SubscriptionPlanPrice $price) => $price->billing_cycle === $billingCycle
            ) ?? $prices->get($planCode)?->first();

            $amount = (float) ($priceRow?->list_price ?? 0);
            $currency = (string) ($priceRow?->currency ?? 'EGP');
            $notes = $amount > 0
                ? 'Backfilled from existing tenant subscription using reference pricing.'
                : 'Backfilled from existing tenant subscription. Original amount was unavailable, so this entry was recorded with 0.';

            $effectiveFrom = $tenant->start_date
                ? Carbon::parse($tenant->start_date)->toDateString()
                : now()->toDateString();

            $effectiveTo = $tenant->end_date
                ? Carbon::parse($tenant->end_date)->toDateString()
                : null;

            $type = $this->guessTransactionType((string) $tenant->status);

            $this->line("Backfilling tenant #{$tenant->id} ({$tenant->name}) plan={$planCode} amount={$amount} {$currency} cycle={$billingCycle}");

            if ($isDryRun) {
                continue;
            }

            $contract = $this->contractService->createContract($tenant, [
                'plan_code' => $planCode,
                'currency' => $currency,
                'billing_cycle' => $billingCycle,
                'agreed_amount' => $amount,
                'effective_from' => $effectiveFrom,
                'notes' => $notes,
            ], null);
            $createdContracts++;

            if ($effectiveTo) {
                $contract->forceFill(['effective_to' => $effectiveTo])->save();
            }

            $this->transactionService->record($tenant, [
                'contract_id' => $contract->id,
                'type' => $type,
                'status' => 'paid',
                'currency' => $currency,
                'total_amount' => $amount,
                'period_start' => $effectiveFrom,
                'period_end' => $effectiveTo,
                'notes' => $notes,
                'plan_code' => $planCode,
                'plan_label' => $plans->get($planCode)?->name ?? $planCode,
            ], null, 'auto_system');
            $createdTransactions++;
        }

        $this->newLine();
        $this->info(sprintf(
            'Backfill complete. Contracts: %d, Transactions: %d, Skipped: %d%s',
            $createdContracts,
            $createdTransactions,
            $skipped,
            $isDryRun ? ' (dry run)' : ''
        ));

        return self::SUCCESS;
    }

    private function guessBillingCycle(Tenant $tenant): string
    {
        if (!$tenant->end_date) {
            return 'lifetime';
        }

        if (!$tenant->start_date) {
            return 'monthly';
        }

        $start = Carbon::parse($tenant->start_date);
        $end = Carbon::parse($tenant->end_date);
        $days = max(1, $start->diffInDays($end));

        return $days >= 300 ? 'yearly' : 'monthly';
    }

    private function guessTransactionType(string $status): string
    {
        return match (strtolower($status)) {
            'cancelled' => 'cancellation',
            default => 'creation',
        };
    }
}
