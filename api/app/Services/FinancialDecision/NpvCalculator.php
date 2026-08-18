<?php

namespace App\Services\FinancialDecision;

use App\Services\FinancialDecision\Dto\CashFlow;
use App\Services\FinancialDecision\Dto\FinancialAssumptions;
use App\Services\FinancialDecision\Dto\NpvResult;
use DateTimeImmutable;

final class NpvCalculator
{
    /**
     * @param  list<CashFlow>  $cashFlows
     */
    public function calculate(array $cashFlows, FinancialAssumptions $assumptions): NpvResult
    {
        $rate = Money::of($assumptions->discountRate ?? '0');
        $valuation = new DateTimeImmutable($assumptions->valuationDate);
        $npv = Money::of('0');
        $trace = [];

        foreach ($cashFlows as $flow) {
            $date = new DateTimeImmutable($flow->date);
            $days = (int) $valuation->diff($date)->format('%r%a');
            if ($days < 0) {
                $days = 0;
            }

            $t = Money::div((string) $days, '365');
            $denominator = Money::pow(Money::add('1', $rate), $t);
            $pv = Money::cmp($denominator, '0') === 0
                ? Money::of($flow->amount)
                : Money::div(Money::of($flow->amount), $denominator);
            $npv = Money::add($npv, $pv);

            $trace[] = [
                'sequence' => $flow->sequence,
                'amount' => $flow->amount,
                'date' => $flow->date,
                'days' => $days,
                't' => $t,
                'pv' => $pv,
            ];
        }

        return new NpvResult($npv, $trace);
    }
}
