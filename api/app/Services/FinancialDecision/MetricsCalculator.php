<?php

namespace App\Services\FinancialDecision;

use App\Services\FinancialDecision\Dto\CashFlow;
use App\Services\FinancialDecision\Dto\FinancialMetrics;
use App\Services\FinancialDecision\Dto\FinancialOffer;
use DateTimeImmutable;

final class MetricsCalculator
{
    /**
     * @param  list<CashFlow>  $cashFlows
     */
    public function calculate(FinancialOffer $offer, array $cashFlows, string $npv, string $valuationDate): FinancialMetrics
    {
        $net = Money::of($offer->netAmount);
        if (Money::cmp($net, '0') <= 0) {
            throw new \InvalidArgumentException('net_amount_invalid');
        }

        $total = Money::of('0');
        $initial = Money::of('0');
        $start = new DateTimeImmutable($valuationDate);
        $last = $start;

        foreach ($cashFlows as $flow) {
            $amount = Money::of($flow->amount);
            $total = Money::add($total, $amount);
            if ($flow->type === 'initial_payment') {
                $initial = Money::add($initial, $amount);
            }
            $date = new DateTimeImmutable($flow->date);
            if ($date > $last) {
                $last = $date;
            }
        }

        if (Money::cmp($initial, '0') === 0 && isset($cashFlows[0])) {
            $initial = Money::of($cashFlows[0]->amount);
        }

        $npvRatio = Money::div(Money::of($npv), $net);
        $days = (int) $start->diff($last)->format('%a');
        $durationMonths = (int) max(0, (int) round($days / 30.437));

        return new FinancialMetrics(
            grossAmount: Money::roundHalfUp($offer->grossAmount),
            discountAmount: Money::roundHalfUp($offer->discountAmount),
            discountPercentage: Money::roundHalfUp($offer->discountPercentage, 4),
            netAmount: Money::roundHalfUp($net),
            npv: Money::roundHalfUp($npv),
            npvRatio: Money::roundHalfUp($npvRatio, 6),
            npvPercentage: Money::roundHalfUp(Money::mul($npvRatio, '100'), 4),
            totalCashFlow: Money::roundHalfUp($total),
            initialCollectionPercentage: Money::roundHalfUp(Money::div(Money::mul($initial, '100'), $net), 4),
            durationMonths: $durationMonths,
        );
    }
}
