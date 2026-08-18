<?php

namespace App\Services\FinancialDecision;

use App\Services\FinancialDecision\Dto\CashFlow;
use DateInterval;
use DateTimeImmutable;
use InvalidArgumentException;

final class CashFlowGenerator
{
    /**
     * @param  list<array<string,mixed>>  $allocations
     * @return array{ok:bool,status:?string,reason:?string,cash_flows:list<CashFlow>}
     */
    public function generate(string $netAmount, string $startDate, array $allocations): array
    {
        $net = Money::of($netAmount);
        if (Money::cmp($net, '0') <= 0) {
            return $this->fail('invalid', 'net_amount_invalid');
        }

        try {
            $start = new DateTimeImmutable($startDate);
        } catch (\Throwable) {
            return $this->fail('invalid', 'start_date_invalid');
        }

        $expanded = [];
        $allocated = Money::of('0');
        $sequence = 1;

        foreach ($allocations as $index => $row) {
            $type = (string) ($row['type'] ?? 'custom');
            $amount = isset($row['amount']) && $row['amount'] !== null && $row['amount'] !== ''
                ? Money::of($row['amount'])
                : null;
            $percentage = isset($row['percentage']) && $row['percentage'] !== null && $row['percentage'] !== ''
                ? Money::of($row['percentage'])
                : null;

            if ($amount === null && $percentage !== null) {
                $amount = Money::div(Money::mul($net, $percentage), '100');
            }

            if ($amount === null) {
                return $this->fail('incomplete', 'allocation_amount_missing');
            }

            $count = max(1, (int) ($row['count'] ?? 1));
            $frequency = strtolower((string) ($row['frequency'] ?? 'once'));
            $baseDate = $this->parseDate($row['date'] ?? null) ?? $start;

            $installmentAmount = $count > 1 ? Money::div($amount, (string) $count) : $amount;

            for ($i = 0; $i < $count; $i++) {
                $date = $this->shiftDate($baseDate, $frequency, $i);
                    $flowType = $type;
                    if ($count > 1 && $type === 'initial_payment') {
                        $flowType = 'installment';
                    }

                    $expanded[] = [
                    'amount' => $installmentAmount,
                    'date' => $date->format('Y-m-d'),
                    'type' => $flowType,
                    'percentage' => $percentage,
                    'description' => (string) ($row['description'] ?? $type),
                    'metadata' => is_array($row['metadata'] ?? null) ? $row['metadata'] : ['allocation_index' => $index],
                ];
                $allocated = Money::add($allocated, $installmentAmount);
            }
        }

        if ($expanded === []) {
            return $this->fail('incomplete', 'cash_flow_empty');
        }

        $difference = Money::sub($net, $allocated);
        $tolerance = Money::allocationTolerance($net);

        if (Money::cmp(Money::abs($difference), $tolerance) > 0) {
            return $this->fail('incomplete', 'schedule_does_not_balance');
        }

        $last = array_key_last($expanded);
        $expanded[$last]['amount'] = Money::add($expanded[$last]['amount'], $difference);

        $cashFlows = [];
        foreach ($expanded as $row) {
            $cashFlows[] = new CashFlow(
                amount: Money::roundHalfUp($row['amount']),
                date: $row['date'],
                type: $row['type'],
                sequence: $sequence++,
                percentage: $row['percentage'] !== null ? Money::roundHalfUp($row['percentage'], 4) : null,
                description: $row['description'],
                metadata: $row['metadata'],
            );
        }

        return [
            'ok' => true,
            'status' => null,
            'reason' => null,
            'cash_flows' => $cashFlows,
        ];
    }

    /**
     * @return array{ok:bool,status:string,reason:string,cash_flows:array}
     */
    private function fail(string $status, string $reason): array
    {
        return [
            'ok' => false,
            'status' => $status,
            'reason' => $reason,
            'cash_flows' => [],
        ];
    }

    private function parseDate(mixed $value): ?DateTimeImmutable
    {
        if ($value === null || $value === '') {
            return null;
        }

        try {
            return new DateTimeImmutable((string) $value);
        } catch (\Throwable) {
            return null;
        }
    }

    private function shiftDate(DateTimeImmutable $start, string $frequency, int $index): DateTimeImmutable
    {
        if ($index <= 0 || in_array($frequency, ['once', ''], true)) {
            return $start;
        }

        $spec = match ($frequency) {
            'monthly' => 'P1M',
            'quarterly' => 'P3M',
            'semiannual', 'semi-annual' => 'P6M',
            'annual', 'yearly' => 'P1Y',
            default => throw new InvalidArgumentException('Unsupported frequency: '.$frequency),
        };

        $date = $start;
        for ($i = 0; $i < $index; $i++) {
            $date = $date->add(new DateInterval($spec));
        }

        return $date;
    }
}
