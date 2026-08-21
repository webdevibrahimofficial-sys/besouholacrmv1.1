<?php

namespace App\Services\FinancialDecision;

use App\Models\User;
use App\Services\FinancialDecision\Adapters\FinancialInputAdapter;
use App\Services\FinancialDecision\Dto\FinancialAssumptions;
use App\Services\FinancialDecision\Dto\FinancialDecision;
use App\Services\FinancialDecision\Dto\FinancialInputSource;
use App\Services\FinancialDecision\Dto\FinancialMetrics;
use App\Services\FinancialDecision\Dto\FinancialOffer;
use App\Services\FinancialDecision\Dto\FinancialPolicy;
use App\Services\FinancialDecision\Dto\StructuredFinancialRequest;

/**
 * Phase 2 reverse calculations. All numbers come from re-running the same engine path.
 * LLM must never invent max discount / min down payment.
 */
final class ReverseCalcEngine
{
    private const STEP = '0.01';

    private const MAX_ITERATIONS = 48;

    public function __construct(
        private readonly FinancialInputAdapter $adapter,
        private readonly CashFlowGenerator $generator,
        private readonly NpvCalculator $npv,
        private readonly MetricsCalculator $metrics,
        private readonly DecisionEngine $decisions,
    ) {
    }

    /**
     * @return list<array{code:string,value:string,unit:string,target_decision:string}>
     */
    public function recommend(
        User $user,
        StructuredFinancialRequest $baseRequest,
        FinancialAssumptions $assumptions,
        FinancialPolicy $policy,
        string $valuationDate,
    ): array {
        $items = [];

        $maxApproved = $this->findMaxDiscount(
            $user,
            $baseRequest,
            $assumptions,
            $policy,
            $valuationDate,
            ['approved', 'approved_with_warning']
        );
        if ($maxApproved !== null) {
            $items[] = [
                'code' => 'max_discount_percentage',
                'value' => Money::roundHalfUp($maxApproved, 2),
                'unit' => 'percent',
                'target_decision' => 'approved',
            ];
        }

        $maxManager = $this->findMaxDiscount(
            $user,
            $baseRequest,
            $assumptions,
            $policy,
            $valuationDate,
            ['approved', 'approved_with_warning', 'manager_approval_required']
        );
        if ($maxManager !== null
            && ($maxApproved === null || Money::cmp($maxManager, $maxApproved) > 0)
        ) {
            $items[] = [
                'code' => 'max_discount_percentage_with_manager',
                'value' => Money::roundHalfUp($maxManager, 2),
                'unit' => 'percent',
                'target_decision' => 'manager_approval_required',
            ];
        }

        $minDown = $this->findMinDownPayment(
            $user,
            $baseRequest,
            $assumptions,
            $policy,
            $valuationDate,
            ['approved', 'approved_with_warning']
        );
        if ($minDown !== null) {
            $items[] = [
                'code' => 'min_down_payment_percentage',
                'value' => Money::roundHalfUp($minDown, 2),
                'unit' => 'percent',
                'target_decision' => 'approved',
            ];
        }

        return $items;
    }

    /**
     * Binary search highest discount % that still yields an allowed decision.
     *
     * @param  list<string>  $allowedDecisions
     */
    public function findMaxDiscount(
        User $user,
        StructuredFinancialRequest $baseRequest,
        FinancialAssumptions $assumptions,
        FinancialPolicy $policy,
        string $valuationDate,
        array $allowedDecisions,
    ): ?string {
        $ceiling = Money::of($policy->managerMaximumDiscountPercentage ?? $policy->maximumDiscountPercentage ?? '0');
        if (Money::cmp($ceiling, '0') <= 0) {
            return null;
        }

        $zeroDecision = $this->evaluateDiscount($user, $baseRequest, '0', $assumptions, $policy, $valuationDate);
        if (! $zeroDecision || ! in_array($zeroDecision->decision, $allowedDecisions, true)) {
            return null;
        }

        $low = '0';
        $high = $ceiling;
        $best = '0';

        for ($i = 0; $i < self::MAX_ITERATIONS; $i++) {
            if (Money::cmp(Money::sub($high, $low), self::STEP) <= 0) {
                break;
            }

            $mid = Money::div(Money::add($low, $high), '2');
            $decision = $this->evaluateDiscount($user, $baseRequest, $mid, $assumptions, $policy, $valuationDate);
            if ($decision && in_array($decision->decision, $allowedDecisions, true)) {
                $best = $mid;
                $low = $mid;
            } else {
                $high = $mid;
            }
        }

        $highDecision = $this->evaluateDiscount($user, $baseRequest, $high, $assumptions, $policy, $valuationDate);
        if ($highDecision && in_array($highDecision->decision, $allowedDecisions, true)) {
            return $high;
        }

        return $best;
    }

    /**
     * Binary search lowest down-payment % that still yields an allowed decision.
     *
     * @param  list<string>  $allowedDecisions
     */
    public function findMinDownPayment(
        User $user,
        StructuredFinancialRequest $baseRequest,
        FinancialAssumptions $assumptions,
        FinancialPolicy $policy,
        string $valuationDate,
        array $allowedDecisions,
    ): ?string {
        $floor = Money::of($policy->minimumInitialCollectionPercentage ?? '0');
        $high = '100';

        $atHundred = $this->evaluateDownPayment($user, $baseRequest, $high, $assumptions, $policy, $valuationDate);
        if (! $atHundred || ! in_array($atHundred->decision, $allowedDecisions, true)) {
            return null;
        }

        $low = $floor;
        $best = $high;

        for ($i = 0; $i < self::MAX_ITERATIONS; $i++) {
            if (Money::cmp(Money::sub($high, $low), self::STEP) <= 0) {
                break;
            }

            $mid = Money::div(Money::add($low, $high), '2');
            $decision = $this->evaluateDownPayment($user, $baseRequest, $mid, $assumptions, $policy, $valuationDate);
            if ($decision && in_array($decision->decision, $allowedDecisions, true)) {
                $best = $mid;
                $high = $mid;
            } else {
                $low = $mid;
            }
        }

        $floorDecision = $this->evaluateDownPayment($user, $baseRequest, $floor, $assumptions, $policy, $valuationDate);
        if ($floorDecision && in_array($floorDecision->decision, $allowedDecisions, true)) {
            return $floor;
        }

        return $best;
    }

    private function evaluateDiscount(
        User $user,
        StructuredFinancialRequest $base,
        string $discountPercentage,
        FinancialAssumptions $assumptions,
        FinancialPolicy $policy,
        string $valuationDate,
    ): ?FinancialDecision {
        $request = $this->cloneRequest($base, [
            'discount_percentage' => $discountPercentage,
            'discount_amount' => null,
            'mode' => 'evaluate',
            'intent' => 'evaluate',
        ]);

        return $this->runPipeline($user, $request, $assumptions, $policy, $valuationDate);
    }

    private function evaluateDownPayment(
        User $user,
        StructuredFinancialRequest $base,
        string $downPaymentPercentage,
        FinancialAssumptions $assumptions,
        FinancialPolicy $policy,
        string $valuationDate,
    ): ?FinancialDecision {
        $request = $this->cloneRequest($base, [
            'down_payment_percentage' => $downPaymentPercentage,
            'down_payment_amount' => null,
            'mode' => 'evaluate',
            'intent' => 'evaluate',
        ]);

        return $this->runPipeline($user, $request, $assumptions, $policy, $valuationDate);
    }

    private function runPipeline(
        User $user,
        StructuredFinancialRequest $request,
        FinancialAssumptions $assumptions,
        FinancialPolicy $policy,
        string $valuationDate,
    ): ?FinancialDecision {
        if (! $assumptions->isExplicitlyConfigured || $assumptions->discountRate === null) {
            return null;
        }
        if (! $policy->isExplicitlyConfigured || $policy->minimumNpvRatio === null) {
            return null;
        }

        $resolved = $this->adapter->resolve($user, $request, $valuationDate);
        if (! $resolved['ok'] || ! $resolved['offer'] instanceof FinancialOffer) {
            return null;
        }

        $generated = $this->generator->generate(
            $resolved['offer']->netAmount,
            $resolved['offer']->startDate,
            $resolved['allocations']
        );
        if (! $generated['ok']) {
            return null;
        }

        try {
            $npv = $this->npv->calculate($generated['cash_flows'], $assumptions);
            $metrics = $this->metrics->calculate(
                $resolved['offer'],
                $generated['cash_flows'],
                $npv->npv,
                $assumptions->valuationDate
            );
        } catch (\Throwable) {
            return null;
        }

        /** @var FinancialInputSource $source */
        $source = $resolved['source'];

        return $this->decisions->decide('evaluated', [], $metrics, $assumptions, $policy, $source, $npv->trace, 'evaluate');
    }

    /**
     * @param  array<string,mixed>  $overrides
     */
    private function cloneRequest(StructuredFinancialRequest $base, array $overrides): StructuredFinancialRequest
    {
        $payload = array_merge($base->toArray(), $overrides);
        unset($payload['stripped_fields'], $payload['parser_source']);

        return new StructuredFinancialRequest(
            intent: (string) ($payload['intent'] ?? 'evaluate'),
            leadId: isset($payload['lead_id']) ? (int) $payload['lead_id'] : null,
            unitId: isset($payload['unit_id']) ? (int) $payload['unit_id'] : null,
            quoteId: isset($payload['quote_id']) ? (int) $payload['quote_id'] : null,
            discountPercentage: isset($payload['discount_percentage']) ? (string) $payload['discount_percentage'] : null,
            discountAmount: isset($payload['discount_amount']) ? (string) $payload['discount_amount'] : null,
            downPaymentPercentage: isset($payload['down_payment_percentage']) ? (string) $payload['down_payment_percentage'] : null,
            downPaymentAmount: isset($payload['down_payment_amount']) ? (string) $payload['down_payment_amount'] : null,
            durationMonths: isset($payload['duration_months']) ? (int) $payload['duration_months'] : null,
            durationYears: isset($payload['duration_years']) ? (int) $payload['duration_years'] : null,
            grossAmount: isset($payload['gross_amount']) ? (string) $payload['gross_amount'] : null,
            frequency: isset($payload['frequency']) ? (string) $payload['frequency'] : null,
            mode: (string) ($payload['mode'] ?? 'evaluate'),
            strippedFields: [],
            parserSource: 'reverse',
        );
    }
}
