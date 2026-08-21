<?php

namespace App\Services\FinancialDecision;

use App\Services\FinancialDecision\Dto\FinancialAssumptions;
use App\Services\FinancialDecision\Dto\FinancialDecision;
use App\Services\FinancialDecision\Dto\FinancialInputSource;
use App\Services\FinancialDecision\Dto\FinancialMetrics;
use App\Services\FinancialDecision\Dto\FinancialPolicy;

final class DecisionEngine
{
    /**
     * @param  list<string>  $preReasons
     */
    public function decide(
        string $status,
        array $preReasons,
        FinancialMetrics $metrics,
        FinancialAssumptions $assumptions,
        FinancialPolicy $policy,
        FinancialInputSource $source,
        array $calculationTrace,
        string $mode = 'evaluate',
    ): FinancialDecision {
        if ($mode !== 'evaluate' && $mode !== 'max_discount') {
            return $this->make('incomplete', 'incomplete', ['not_implemented'], [], $metrics, $assumptions, $policy, $source, $calculationTrace);
        }

        // max_discount is handled by FinancialDecisionService before calling decide with evaluate semantics.
        if ($mode === 'max_discount') {
            return $this->make('incomplete', 'incomplete', ['not_implemented'], [], $metrics, $assumptions, $policy, $source, $calculationTrace);
        }

        if ($status === 'invalid') {
            return $this->make('invalid', 'invalid', $preReasons ?: ['invalid_input'], [], $metrics, $assumptions, $policy, $source, $calculationTrace);
        }

        if ($status === 'incomplete' || $preReasons !== []) {
            return $this->make('incomplete', 'incomplete', $preReasons ?: ['incomplete_input'], [], $metrics, $assumptions, $policy, $source, $calculationTrace);
        }

        if (! $assumptions->isExplicitlyConfigured || $assumptions->discountRate === null || $assumptions->discountRate === '') {
            return $this->make('incomplete', 'incomplete', ['financial_assumptions_missing'], [], $metrics, $assumptions, $policy, $source, $calculationTrace);
        }

        if (! $policy->isExplicitlyConfigured || $policy->minimumNpvRatio === null) {
            return $this->make('incomplete', 'incomplete', ['financial_policy_missing'], [], $metrics, $assumptions, $policy, $source, $calculationTrace);
        }

        $reasons = [];
        $warnings = [];
        $rejected = false;
        $needsManager = false;

        $discount = Money::of($metrics->discountPercentage);
        $maxDiscount = Money::of($policy->maximumDiscountPercentage ?? '0');
        $managerMax = Money::of($policy->managerMaximumDiscountPercentage ?? $policy->maximumDiscountPercentage ?? '0');
        if (Money::cmp($managerMax, $maxDiscount) < 0) {
            $managerMax = $maxDiscount;
        }

        if (Money::cmp($discount, $managerMax) > 0) {
            $reasons[] = 'discount_exceeds_maximum';
            $rejected = true;
        } elseif (Money::cmp($discount, $maxDiscount) > 0) {
            $reasons[] = 'discount_exceeds_standard_policy';
            $needsManager = true;
        }

        $npvRatio = Money::of($metrics->npvRatio);
        $minRatio = Money::of($policy->minimumNpvRatio);
        if (Money::cmp($npvRatio, $minRatio) < 0) {
            $reasons[] = 'npv_below_minimum';
            $rejected = true;
        }

        $initial = Money::of($metrics->initialCollectionPercentage);
        $minInitial = Money::of($policy->minimumInitialCollectionPercentage ?? '0');
        if (Money::cmp($initial, $minInitial) < 0) {
            $reasons[] = 'initial_collection_below_minimum';
            $rejected = true;
        }

        if ($policy->maximumDurationMonths !== null && $metrics->durationMonths > $policy->maximumDurationMonths) {
            $reasons[] = 'duration_exceeds_maximum';
            $rejected = true;
        }

        if ($rejected) {
            return $this->make('rejected', 'evaluated', $reasons, $warnings, $metrics, $assumptions, $policy, $source, $calculationTrace);
        }

        if ($needsManager) {
            return $this->make('manager_approval_required', 'evaluated', $reasons, $warnings, $metrics, $assumptions, $policy, $source, $calculationTrace);
        }

        if (Money::cmp($discount, $maxDiscount) === 0) {
            $warnings[] = 'discount_at_policy_limit';
        }

        $decision = $warnings !== [] ? 'approved_with_warning' : 'approved';

        return $this->make($decision, 'evaluated', $reasons, $warnings, $metrics, $assumptions, $policy, $source, $calculationTrace);
    }

    /**
     * @param  list<string>  $reasons
     * @param  list<string>  $warnings
     */
    private function make(
        string $decision,
        string $status,
        array $reasons,
        array $warnings,
        FinancialMetrics $metrics,
        FinancialAssumptions $assumptions,
        FinancialPolicy $policy,
        FinancialInputSource $source,
        array $calculationTrace,
    ): FinancialDecision {
        return new FinancialDecision(
            decision: $decision,
            status: $status,
            reasons: array_values($reasons),
            warnings: array_values($warnings),
            metrics: $metrics,
            assumptionsSnapshot: $assumptions->snapshot(),
            policySnapshot: $policy->snapshot(),
            inputSource: $source->toArray(),
            calculationTrace: $calculationTrace,
            engineVersion: EngineVersion::VALUE,
        );
    }
}
